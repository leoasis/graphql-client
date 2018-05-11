import { InMemoryCache } from 'apollo-cache-inmemory';
import gql from "graphql-tag";

test('poc', () => {
  const compiler = new Compiler('../schema.graphql');

  const data = {
    hero: {
      id: 'foo',
      __typename: 'Droid',
      name: 'R2D2'
    }
  };

  const cache = new InMemoryCache();
  cache.writeQuery({
    query: gql`
    query Foo {
      hero {
        id
        name
      }
    }`,
    data
  });
  console.log(cache.extract());
  const { writeQuery } = compiler.compile(`
  query Foo {
    hero {
      id
      __typename
      name
    }
  }`);

  expect(writeQuery(data, {})).toEqual(cache.extract());
});


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

class Compiler {
  constructor(schemaPath) {
    this._schema = getSchema(schemaPath);
  }

  compile(graphqlText) {
    const parsed = Parser.parse(this._schema, graphqlText);
    const root = parsed[0];

    // IRVisitor.visit(parsed[0], {
    //   Root(...args) {
    //     console.log(args);
    //   }
    // });

    function writeField(identifier, field, context) {
      const variableIdentifier = context.makeVariable();

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

      context.addEntity(idExpression, t.objectExpression(
        field.selections.map(field => (
          t.objectProperty(t.stringLiteral(field.name), t.memberExpression(variableIdentifier, t.identifier(field.name)))
        ))
      ));

      return t.sequenceExpression([
        t.assignmentExpression('=', variableIdentifier, member),
        t.objectExpression([
          t.objectProperty(t.stringLiteral('type'), t.stringLiteral('id')),
          t.objectProperty(t.stringLiteral('generated'), t.booleanLiteral(false)),
          t.objectProperty(t.stringLiteral('id'), idExpression),
          t.objectProperty(t.stringLiteral('typename'), typenameExpression),
        ])
      ])
    }

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
    const newRoot = t.objectProperty(
      t.stringLiteral('ROOT_QUERY'), t.objectExpression(
        root.selections.map((field) => {
          return t.objectProperty(t.stringLiteral(field.name), writeField(t.identifier('data'), field, context))
        })
      )
    );

    const ast = t.file(
      t.program([
        t.exportNamedDeclaration(
          t.functionDeclaration(
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
                  newRoot,
                  ...entities
                ])
              )
            ].filter(Boolean))
          ),
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
