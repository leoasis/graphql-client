import path from "path";
import fs from "fs";
import { Parser, Printer, IRVisitor } from "graphql-compiler";
import {
  isListType,
  buildASTSchema,
  buildClientSchema,
  parse,
  printSchema
} from "graphql";
import * as babel from "babel-core";
import * as t from "babel-types";
import { parse as babelParse } from "babylon";
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

export default class Compiler {
  constructor(schemaPath) {
    this._schema = getSchema(schemaPath);
  }

  compile(graphqlText) {
    const parsed = Parser.parse(this._schema, graphqlText);
    const root = parsed[0];

    function writeField(identifier, field, context) {
      const variableIdentifier = context.makeVariable();
      const idVariableIdentifier = context.makeVariable();
      const member = t.memberExpression(identifier, t.identifier(field.name));
      const typenameExpression = t.memberExpression(
        variableIdentifier,
        t.identifier("__typename")
      );
      const idExpression = t.binaryExpression(
        "+",
        t.binaryExpression("+", typenameExpression, t.stringLiteral(":")),
        t.memberExpression(variableIdentifier, t.identifier("id"))
      );

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
                const fieldIdsVariable = context.makeVariable();

                const itemIdentifier = t.identifier("item");
                const itemTypenameExpression = t.memberExpression(
                  itemIdentifier,
                  t.identifier("__typename")
                );
                const itemIdExpression = t.binaryExpression(
                  "+",
                  t.binaryExpression(
                    "+",
                    itemTypenameExpression,
                    t.stringLiteral(":")
                  ),
                  t.memberExpression(itemIdentifier, t.identifier("id"))
                );
                context.addEntities(
                  t.callExpression(
                    t.memberExpression(fieldVariable, t.identifier("reduce")),
                    [
                      t.arrowFunctionExpression(
                        [t.identifier("obj"), itemIdentifier],
                        t.blockStatement([
                          t.expressionStatement(
                            t.assignmentExpression(
                              "=",
                              t.memberExpression(
                                t.identifier("obj"),
                                itemIdExpression,
                                true
                              ),
                              itemIdentifier // Here we should be recursing
                            )
                          ),
                          t.returnStatement(t.identifier("obj"))
                        ])
                      ),
                      t.objectExpression([])
                    ]
                  )
                );
                value = t.sequenceExpression([
                  t.assignmentExpression(
                    "=",
                    fieldVariable,
                    fieldMemberExpression
                  ),
                  t.callExpression(
                    t.memberExpression(fieldVariable, t.identifier("map")),
                    [
                      t.arrowFunctionExpression(
                        [itemIdentifier],
                        itemIdExpression
                      )
                    ]
                  )
                ]);
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

    function compileWriteQuery() {
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
      const writeRoot = t.objectProperty(
        t.stringLiteral("ROOT_QUERY"),
        t.objectExpression(
          root.selections.map(field => {
            return t.objectProperty(
              t.stringLiteral(field.name),
              writeField(t.identifier("data"), field, context)
            );
          })
        )
      );

      return t.functionDeclaration(
        t.identifier("writeQuery"),
        [t.identifier("data"), t.identifier("cache")],
        t.blockStatement(
          [
            variables.length > 0
              ? t.variableDeclaration(
                  "let",
                  variables.map(vid => t.variableDeclarator(vid))
                )
              : null,
            t.returnStatement(
              t.objectExpression([
                t.spreadProperty(t.identifier("cache")),
                writeRoot,
                ...entities
              ])
            )
          ].filter(Boolean)
        )
      );
    }

    function readField(identifier, field, context) {
      if (field.selections) {
        if (isListType(field.type)) {
          const refIdentifier = context.makeVariable();
          return t.sequenceExpression([
            t.assignmentExpression(
              "=",
              refIdentifier,
              t.memberExpression(identifier, t.identifier(field.name))
            ),
            t.callExpression(
              t.memberExpression(refIdentifier, t.identifier("map")),
              [
                t.arrowFunctionExpression(
                  [t.identifier("item")],
                  t.memberExpression(
                    t.identifier("cache"),
                    t.identifier("item"),
                    true
                  ) // Recursion should happen here
                )
              ]
            )
          ]);
        } else {
          const refIdentifier = context.makeVariable();
          const valueInCacheIdentifier = context.makeVariable();
          return t.sequenceExpression([
            t.assignmentExpression(
              "=",
              refIdentifier,
              t.memberExpression(identifier, t.identifier(field.name))
            ),
            t.assignmentExpression(
              "=",
              valueInCacheIdentifier,
              t.memberExpression(t.identifier("cache"), refIdentifier, true)
            ),
            t.objectExpression(
              field.selections.map(subField =>
                t.objectProperty(
                  t.stringLiteral(subField.name),
                  readField(valueInCacheIdentifier, subField, context)
                )
              )
            )
          ]);
        }
      } else {
        return t.memberExpression(identifier, t.identifier(field.name));
      }
    }

    function compileReadQuery() {
      const variables = [];
      const context = {
        makeVariable() {
          const identifier = t.identifier(`v${variables.length}`);
          variables.push(identifier);
          return identifier;
        }
      };

      const variableIdentifier = context.makeVariable();
      const readRoot = t.sequenceExpression([
        t.assignmentExpression(
          "=",
          variableIdentifier,
          t.memberExpression(t.identifier("cache"), t.identifier("ROOT_QUERY"))
        ),
        t.objectExpression(
          root.selections.map(field => {
            return t.objectProperty(
              t.stringLiteral(field.name),
              readField(variableIdentifier, field, context)
            );
          })
        )
      ]);

      return t.functionDeclaration(
        t.identifier("readQuery"),
        [t.identifier("cache")],
        t.blockStatement(
          [
            variables.length > 0
              ? t.variableDeclaration(
                  "let",
                  variables.map(vid => t.variableDeclarator(vid))
                )
              : null,
            t.returnStatement(readRoot)
          ].filter(Boolean)
        )
      );
    }

    const ast = t.file(
      t.program([
        t.exportNamedDeclaration(compileWriteQuery(), []),
        t.exportNamedDeclaration(compileReadQuery(), [])
      ])
    );

    return generate(ast).code;
  }
}
