import gql from "graphql-tag";
import Compiler from ".";
import evaluate from "./evaluate";

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
  expect(read).toEqual(data);
});

test("nested lists", () => {
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
          appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"],
          friends: [
            {
              __typename: "Droid",
              id: "2001",
              name: "R2-D2"
            },
            {
              __typename: "Human",
              id: "1002",
              name: "Han Solo"
            }
          ]
        },
        {
          __typename: "Human",
          id: "1002",
          name: "Han Solo",
          appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"],
          friends: []
        },
        {
          __typename: "Human",
          id: "1003",
          name: "Leia Organa",
          appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"],
          friends: [
            {
              __typename: "Droid",
              id: "2001",
              name: "R2-D2"
            },
            {
              __typename: "Human",
              id: "1002",
              name: "Han Solo"
            },
            {
              __typename: "Human",
              id: "1000",
              name: "Luke Skywalker"
            }
          ]
        }
      ]
    }
  };

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
        friends {
          __typename
          id
          name
        }
      }
    }
  }
  `);

  expect(code).toMatchSnapshot();

  const { writeQuery, readQuery } = evaluate(code);

  // const written = writeQuery(data, {});

  // Better write query implementation!!!
  // Change code to generate this:
  function writeQuery2(data, cache) {
    let v0, v1;
    const entities = [];
    const root = {
      hero: ((v0 = data.hero),
      (v1 = v0.__typename + ":" + v0.id),
      entities.push([
        v1,
        {
          __typename: v0.__typename,
          id: v0.id,
          name: v0.name,
          friends: v0.friends.map(item => {
            const id = item.__typename + ":" + item.id;
            entities.push([
              id,
              {
                __typename: item.__typename,
                id: item.id,
                name: item.name,
                appearsIn: item.appearsIn,
                friends: item.friends.map(item => {
                  const id = item.__typename + ":" + item.id;
                  entities.push([
                    id,
                    {
                      __typename: item.__typename,
                      id: item.id,
                      name: item.name
                    }
                  ]);
                  return id;
                })
              }
            ]);
            return id;
          })
        }
      ]),
      v1)
    };

    cache = {
      ...cache,
      ROOT_QUERY: root
    };

    entities.forEach(([id, entity]) => {
      cache[id] = { ...cache[id], ...entity };
    });

    return cache;
  }
  const written = writeQuery2(data, {});

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
      appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"],
      friends: ["Droid:2001", "Human:1002"]
    },
    "Human:1002": {
      __typename: "Human",
      id: "1002",
      name: "Han Solo",
      appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"],
      friends: []
    },
    "Human:1003": {
      __typename: "Human",
      id: "1003",
      name: "Leia Organa",
      appearsIn: ["NEWHOPE", "EMPIRE", "JEDI"],
      friends: ["Droid:2001", "Human:1002", "Human:1000"]
    }
  });

  const read = readQuery(written);
  expect(read).toEqual(data);
});
