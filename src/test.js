import { InMemoryCache } from "apollo-cache-inmemory";
import gql from "graphql-tag";
import Compiler from ".";

test("basic read and write query", () => {
  const compiler = new Compiler("../schema.graphql");

  const data = {
    hero: {
      id: "foo",
      __typename: "Droid",
      name: "R2D2"
    }
  };

  const QUERY = gql`
    query Foo {
      hero {
        id
        name
      }
    }
  `;

  const cache = new InMemoryCache();
  cache.writeQuery({
    query: QUERY,
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
    query: QUERY
  });
  expect(read).toEqual(stripSymbols(readFromApollo));
});

test("more complex read and write query", () => {
  const compiler = new Compiler("../schema.graphql");

  const data = {
    hero: {
      __typename: "Droid",
      id: "2001",
      name: "R2-D2",
      friends: [
        {
          __typename: "Human",
          id: "1000",
          name: "Luke Skywalker",
          appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"]
        },
        {
          __typename: "Human",
          id: "1002",
          name: "Han Solo",
          appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"]
        },
        {
          __typename: "Human",
          id: "1003",
          name: "Leia Organa",
          appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"]
        }
      ]
    }
  };

  const QUERY = gql`
    query Foo {
      hero {
        __typename
        id
        name
        friends {
          __typename
          id
          name
          appearsIn
        }
      }
    }
  `;

  const cache = new InMemoryCache();
  cache.writeQuery({
    query: QUERY,
    data
  });

  const { writeQuery, readQuery } = compiler.compile(`
  query Foo {
    hero {
      __typename
      id
      name
      friends {
        __typename
        id
        name
        appearsIn
      }
    }
  }
  `);

  const written = writeQuery(data, {});
  const writtenToApollo = cache.extract();

  expect(written).toEqual(writtenToApollo);

  const read = readQuery(written);
  const readFromApollo = cache.readQuery({
    query: QUERY
  });
  expect(read).toEqual(stripSymbols(readFromApollo));
});

function stripSymbols(obj) {
  return JSON.parse(JSON.stringify(obj));
}
