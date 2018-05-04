

test('poc', () => {
  const compiler = new Compiler('../schema.graphql');
  const { readQuery } = compiler.compile(`
  query Foo {
    hero {
      id
      name
    }
  }`);

  expect(readQuery).toMatchSnapshot();
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
    IRVisitor.visit(parsed[0], {
      Root(...args) {
      }
    });

    const ast = t.file(
      t.program(
        [t.exportNamedDeclaration(t.functionDeclaration(
          t.identifier('readQuery'), [],
            t.blockStatement([
              t.returnStatement(t.stringLiteral('hello world!'))
            ])
          )
        , [])]
      )
    );
    const mod1 = vm.runInNewContext(babel.transform('export function what() {}').code);
    const mod = vm.runInNewContext(babel.transformFromAst(ast).code);
    console.log(mod);
  }
}
