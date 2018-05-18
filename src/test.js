import { InMemoryCache } from 'apollo-cache-inmemory';
import gql from "graphql-tag";
import Compiler from '.';
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

  const { writeQuery, readQuery } = compiler.compile(`
  query Foo {
    hero {
      id
      __typename
      name
    }
  }`);

  const written = writeQuery(data, {});
  const writtenToApollo = cache.extract();

  expect(written).toEqual(writtenToApollo);

  const read = readQuery(written);
  const readFromApollo = cache.readQuery({
    query: gql`
      query Foo {
        hero {
          id
          name
        }
      }`,
  });
  expect(read).toEqual(stripSymbols(readFromApollo));
});


function stripSymbols(obj) {
  return JSON.parse(JSON.stringify(obj));
}
