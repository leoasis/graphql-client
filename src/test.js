import { InMemoryCache } from "apollo-cache-inmemory";
import gql from "graphql-tag";
import Compiler from ".";
import vm from "vm";
import m from "module";
import * as babel from "babel-core";

function evaluate(code) {
  const exported = {};
  const mod = vm.runInNewContext(
    m.wrap(
      babel.transform(code, {
        presets: ["env"],
        plugins: ["transform-object-rest-spread"]
      }).code
    )
  );
  mod(exported);
  return exported;
}

test("basic read and write query", () => {
  const compiler = new Compiler("../schema.graphql");

  const data = {
    hero: {
      id: "foo",
      __typename: "Droid",
      name: "R2D2"
    }
  };

  const code = compiler.compile(`
  query Foo {
    hero {
      id
      __typename
      name
    }
  }`);

  expect(code).toMatchSnapshot();

  const { writeQuery, readQuery } = evaluate(code);

  const written = writeQuery(data, {});
  expect(written).toEqual({
    ROOT_QUERY: {
      hero: "Droid:foo"
    },
    "Droid:foo": {
      __typename: "Droid",
      id: "foo",
      name: "R2D2"
    }
  });

  const read = readQuery(written);
  expect(read).toEqual(data);
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

  const code = compiler.compile(`
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

  expect(code).toMatchSnapshot();

  const { writeQuery, readQuery } = evaluate(code);

  const written = writeQuery(data, {});
  const writtenToApollo = cache.extract();

  expect(written).toEqual({
    ROOT_QUERY: {
      hero: "Droid:2001"
    },
    "Droid:2001": {
      __typename: "Droid",
      id: "2001",
      name: "R2-D2",
      friends: ["Human:1000", "Human:1002", "Human:1003"]
    },
    "Human:1000": {
      __typename: "Human",
      id: "1000",
      name: "Luke Skywalker",
      appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"]
    },
    "Human:1002": {
      __typename: "Human",
      id: "1002",
      name: "Han Solo",
      appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"]
    },
    "Human:1003": {
      __typename: "Human",
      id: "1003",
      name: "Leia Organa",
      appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"]
    }
  });

  const read = readQuery(written);
  const readFromApollo = cache.readQuery({
    query: QUERY
  });
  expect(read).toEqual(data);
});
