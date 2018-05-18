import path from 'path';
import fs from 'fs';
import { Parser, Printer, IRVisitor } from 'graphql-compiler';
import {
  buildASTSchema,
  buildClientSchema,
  parse,
  printSchema
} from 'graphql';
import * as babel from 'babel-core';
import * as t from 'babel-types';
import { parse as babelParse } from 'babylon';
import generate from 'babel-generator';
import vm from 'vm';
import m from 'module';

function getSchema(schemaPath) {
  try {
    var source = fs.readFileSync(path.join(__dirname, schemaPath), 'utf8');
    if (path.extname(schemaPath) === '.json') {
      source = printSchema(buildClientSchema(JSON.parse(source).data));
    }
    source = '\n  directive @include(if: Boolean) on FRAGMENT_SPREAD | FIELD\n  directive @skip(if: Boolean) on FRAGMENT_SPREAD | FIELD\n\n  ' + source + '\n  ';
    return buildASTSchema(parse(source), { assumeValid: true });
  } catch (error) {
    throw new Error(('\nError loading schema. Expected the schema to be a .graphql or a .json\nfile, describing your GraphQL server\'s API. Error detail:\n\n' + error.stack + '\n    ').trim());
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
      const member = t.memberExpression(
        identifier,
        t.identifier(field.name),
      );
      const typenameExpression = t.memberExpression(
        variableIdentifier,
        t.identifier('__typename')
      );
      const idExpression = t.binaryExpression(
        '+',
        t.binaryExpression(
          '+',
          typenameExpression,
          t.stringLiteral(':')
        ),
        t.memberExpression(
          variableIdentifier,
          t.identifier('id')
        )
      );

      context.addEntity(idVariableIdentifier, t.objectExpression(
        field.selections.map(field => (
          t.objectProperty(t.stringLiteral(field.name), t.memberExpression(variableIdentifier, t.identifier(field.name)))
        ))
      ));

      return t.sequenceExpression([
        t.assignmentExpression('=', variableIdentifier, member),
        t.assignmentExpression('=', idVariableIdentifier, idExpression),
        t.objectExpression([
          t.objectProperty(t.stringLiteral('type'), t.stringLiteral('id')),
          t.objectProperty(t.stringLiteral('generated'), t.booleanLiteral(false)),
          t.objectProperty(t.stringLiteral('id'), idVariableIdentifier),
          t.objectProperty(t.stringLiteral('typename'), typenameExpression),
        ])
      ])
    }

    function compileWriteQuery() {
      const variables = [];
      const entities = [];
      const context = {
        addEntity(id, object) {
          entities.push(t.objectProperty(id, object, true));
        },
        makeVariable() {
          const identifier = t.identifier(`v${variables.length}`);
          variables.push(identifier);
          return identifier;
        }
      }
      const writeRoot = t.objectProperty(
        t.stringLiteral('ROOT_QUERY'), t.objectExpression(
          root.selections.map((field) => {
            return t.objectProperty(t.stringLiteral(field.name), writeField(t.identifier('data'), field, context))
          })
        )
      );

      return t.functionDeclaration(
        t.identifier('writeQuery'),
        [t.identifier('data'), t.identifier('cache')],
        t.blockStatement([
          variables.length > 0 ?
            t.variableDeclaration(
              'let',
              variables.map(vid => t.variableDeclarator(vid))
            ) : null,
          t.returnStatement(
            t.objectExpression([
              t.spreadProperty(t.identifier('cache')),
              writeRoot,
              ...entities
            ])
          )
        ].filter(Boolean))
      );
    }

    function readField(identifier, field, context) {
      if (field.selections) {
        const variableIdentifier = context.makeVariable();
        const variableIdentifier2 = context.makeVariable();
        const variableIdentifier3 = context.makeVariable();
        return t.sequenceExpression([
          t.assignmentExpression('=', variableIdentifier, t.memberExpression(identifier, t.identifier(field.name))),
          t.assignmentExpression('=', variableIdentifier2, t.memberExpression(variableIdentifier, t.identifier('id'))),
          t.assignmentExpression('=', variableIdentifier3, t.memberExpression(t.identifier('cache'), variableIdentifier2, true)),
          t.objectExpression(
            field.selections.map((subField) =>
              t.objectProperty(t.stringLiteral(subField.name), readField(t.memberExpression(variableIdentifier3, t.identifier(subField.name)), subField, context))
            )
          )
        ]);
      } else {
        return identifier;
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
        t.assignmentExpression('=', variableIdentifier, t.memberExpression(t.identifier('cache'), t.identifier('ROOT_QUERY'))),
        t.objectExpression(
          root.selections.map((field) => {
            return t.objectProperty(t.stringLiteral(field.name), readField(variableIdentifier, field, context));
          })
        )
      ]);

      return t.functionDeclaration(
        t.identifier('readQuery'),
        [t.identifier('cache')],
        t.blockStatement([
          variables.length > 0 ?
            t.variableDeclaration(
              'let',
              variables.map(vid => t.variableDeclarator(vid))
            ) : null,
          t.returnStatement(
            readRoot
          )
        ].filter(Boolean))
      )
    }



    const ast = t.file(
      t.program([
        t.exportNamedDeclaration(
          compileWriteQuery(),
          []
        ),
        t.exportNamedDeclaration(
          compileReadQuery(),
          []
        )
      ])
    );

    const code = generate(ast).code;
    console.log(code);
    const exported = {};
    const mod = vm.runInNewContext(m.wrap(babel.transform(code, {
      presets: ['env'], plugins: ['transform-object-rest-spread']
    }).code));
    mod(exported);
    return exported;
  }
}
