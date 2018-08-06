import path from "path";
import fs from "fs";
import { Parser } from "graphql-compiler";
import {
  isListType,
  buildASTSchema,
  buildClientSchema,
  parse,
  printSchema
} from "graphql";
import { template } from "babel-core";
import * as t from "babel-types";
import generate from "babel-generator";

function getSchema(schemaPath) {
  try {
    var source = fs.readFileSync(path.join(__dirname, schemaPath), "utf8");
    if (path.extname(schemaPath) === ".json") {
      source = printSchema(buildClientSchema(JSON.parse(source).data));
    }
    source =
      "\n  directive @include(if: Boolean) on FRAGMENT_SPREAD | FIELD\n  directive @skip(if: Boolean) on FRAGMENT_SPREAD | FIELD\n\n  " +
      source +
      "\n  ";
    return buildASTSchema(parse(source), { assumeValid: true });
  } catch (error) {
    throw new Error(
      (
        "\nError loading schema. Expected the schema to be a .graphql or a .json\nfile, describing your GraphQL server's API. Error detail:\n\n" +
        error.stack +
        "\n    "
      ).trim()
    );
  }
}

const templates = {};

function interpolate(templateString, replacements) {
  let builder = templates[templateString];

  if (!builder) {
    templates[templateString] = builder = template(templateString);
  }

  return builder(replacements);
}

function getIdExpression(identifier) {
  return interpolate('OBJ.__typename + ":" + OBJ.id', { OBJ: identifier })
    .expression;
}

export default class Compiler {
  constructor(schemaPath) {
    this._schema = getSchema(schemaPath);
  }

  compile(graphqlText) {
    const parsed = Parser.parse(this._schema, graphqlText);
    const root = parsed[0];

    const ast = t.file(
      t.program([
        t.exportNamedDeclaration(compileWriteQuery(root), []),
        t.exportNamedDeclaration(compileReadQuery(root), [])
      ])
    );

    return generate(ast).code;
  }
}

function writeField(identifier, field, context) {
  const variableIdentifier = context.makeVariable();
  const idVariableIdentifier = context.makeVariable();
  const member = t.memberExpression(identifier, t.identifier(field.name));

  const idExpression = getIdExpression(variableIdentifier);

  context.addEntity(
    idVariableIdentifier,
    t.objectExpression(
      field.selections.map(field => {
        if (field.selections) {
          let value;

          if (isListType(field.type)) {
            const fieldVariable = context.makeVariable();
            const fieldMemberExpression = t.memberExpression(
              variableIdentifier,
              t.identifier(field.name)
            );
            context.addEntities(
              interpolate(
                `
                FIELD.reduce((obj, item) => {
                  obj[ITEM_ID] = item;
                  // Here we should recurse
                  return obj;
                }, {})
              `,
                {
                  FIELD: fieldVariable,
                  ITEM_ID: getIdExpression(t.identifier("item"))
                }
              ).expression
            );
            value = interpolate(
              `
              (
                FIELD = FIELD_MEMBER,
                FIELD.map((item) => ITEM_ID)
              )
            `,
              {
                FIELD: fieldVariable,
                FIELD_MEMBER: fieldMemberExpression,
                ITEM_ID: getIdExpression(t.identifier("item"))
              }
            ).expression;
          } else {
            value = t.stringLiteral("Whatever"); // here we should be recursing
          }
          return t.objectProperty(t.stringLiteral(field.name), value);
        } else {
          return t.objectProperty(
            t.stringLiteral(field.name),
            t.memberExpression(variableIdentifier, t.identifier(field.name))
          );
        }
      })
    )
  );

  return t.sequenceExpression([
    t.assignmentExpression("=", variableIdentifier, member),
    t.assignmentExpression("=", idVariableIdentifier, idExpression),
    idVariableIdentifier
  ]);
}

const writeQueryTemplate = template(`
  function writeQuery(data, cache) {
    DECLARE_VARS;
    return RESULT;
  }
`);

function compileWriteQuery(root) {
  const variables = [];
  const entities = [];
  const context = {
    addEntity(id, object) {
      entities.unshift(t.objectProperty(id, object, true));
    },
    addEntities(expression) {
      entities.unshift(t.spreadProperty(expression));
    },
    makeVariable() {
      const identifier = t.identifier(`v${variables.length}`);
      variables.push(identifier);
      return identifier;
    }
  };

  const result = t.objectExpression([
    t.spreadProperty(t.identifier("cache")),
    t.objectProperty(
      t.stringLiteral("ROOT_QUERY"),
      t.objectExpression(
        root.selections.map(field => {
          return t.objectProperty(
            t.stringLiteral(field.name),
            writeField(t.identifier("data"), field, context)
          );
        })
      )
    ),
    ...entities
  ]);

  return writeQueryTemplate({
    DECLARE_VARS:
      variables.length > 0
        ? t.variableDeclaration(
            "let",
            variables.map(vid => t.variableDeclarator(vid))
          )
        : null,
    RESULT: result
  });
}

function readField(identifier, field, context) {
  if (field.selections) {
    if (isListType(field.type)) {
      const refIdentifier = context.makeVariable();

      return interpolate(
        `
          (
            REF = FIELD_MEMBER,
            REF.map((item) => cache[item])
          )
        `,
        {
          REF: refIdentifier,
          FIELD_MEMBER: t.memberExpression(identifier, t.identifier(field.name))
        }
      ).expression;
    } else {
      const refIdentifier = context.makeVariable();
      const valueInCacheIdentifier = context.makeVariable();
      return interpolate(
        `
        (
          ID_REF = FIELD_MEMBER,
          CACHE_VALUE = cache[ID_REF],
          OBJ
        )
      `,
        {
          ID_REF: refIdentifier,
          FIELD_MEMBER: t.memberExpression(
            identifier,
            t.identifier(field.name)
          ),
          CACHE_VALUE: valueInCacheIdentifier,
          OBJ: t.objectExpression(
            field.selections.map(subField =>
              t.objectProperty(
                t.stringLiteral(subField.name),
                readField(valueInCacheIdentifier, subField, context)
              )
            )
          )
        }
      ).expression;
    }
  } else {
    return t.memberExpression(identifier, t.identifier(field.name));
  }
}

const readQueryTemplate = template(`
  function readQuery(cache) {
    const root = cache.ROOT_QUERY;
    DECLARE_VARS;
    return RESULT;
  }
`);

function compileReadQuery(root) {
  const variables = [];
  const context = {
    makeVariable() {
      const identifier = t.identifier(`v${variables.length}`);
      variables.push(identifier);
      return identifier;
    }
  };

  const result = t.objectExpression(
    root.selections.map(field => {
      return t.objectProperty(
        t.stringLiteral(field.name),
        readField(t.identifier("root"), field, context)
      );
    })
  );

  return readQueryTemplate({
    DECLARE_VARS:
      variables.length > 0
        ? t.variableDeclaration(
            "let",
            variables.map(vid => t.variableDeclarator(vid))
          )
        : null,
    RESULT: result
  });
}
