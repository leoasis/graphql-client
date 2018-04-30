import "isomorphic-fetch";
import ApolloClient from "apollo-boost";
import gql from "graphql-tag";
import Benchmark from "benchmark";

const client = new ApolloClient({
  uri: "https://mpjk0plp9.lp.gql.zone/graphql"
});

const query = gql`
  query Foo {
    hero {
      id
      name
      friends {
        id
        name
        appearsIn
      }
    }
  }
`;

function manualRead(cache) {
  const hero = cache[cache['ROOT_QUERY'].hero.id];
  return {
    hero: {
      id: hero.id,
      name: hero.name,
      friends: hero.friends.map((friendId) => {
        const friend = cache[friendId.id];
        return {
          id: friend.id,
          name: friend.name,
          appearsIn: friend.appearsIn.json,
          __typename: friend.__typename
        }
      }),
      __typename: hero.__typename
    }
  }
}

client.query({ query }).then(result => {
  client.readQuery({ query });
  const suite = new Benchmark.Suite();

  const cache = client.cache.extract();
  console.log(JSON.stringify(cache, null, 2));
  console.log('Apollo', JSON.stringify(client.readQuery({ query }), null, 2));
  console.log('Manual', JSON.stringify(manualRead(cache), null, 2));
  console.log('Iguales??', JSON.stringify(client.readQuery({ query }), null, 2) === JSON.stringify(manualRead(cache), null, 2));
  // add tests
  suite
    .add("Apollo client readQuery", function() {
      client.readQuery({ query });
    })
    .add("Manual readQuery", function () {
      manualRead(cache);
    })
    .on("complete", function() {
      console.log(this[0].toString());
      console.log(this[1].toString());
      console.log("Fastest is " + this.filter("fastest").map("name"));
    })
    // run async
    .run({ async: true });
});
