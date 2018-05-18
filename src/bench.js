import "isomorphic-fetch";
import ApolloClient from "apollo-boost";
import gql from "graphql-tag";

import { Environment, Network, RecordSource, Store } from "relay-runtime";
import RelayModernRecord from "relay-runtime/lib/RelayModernRecord";
import graphql from "react-relay";

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

function fetchQuery(
  operation,
  variables,
  cacheConfig,
  uploadables,
) {
  return fetch('https://mpjk0plp9.lp.gql.zone/graphql', {
    method: 'POST',
    headers: {
      // Add authentication and other headers here
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      query: operation.text, // GraphQL text from input
      variables,
    }),
  }).then(response => {
    return response.json();
  });
}

const source = new RecordSource();
const store = new Store(source);
const network = Network.create(fetchQuery);
const handlerProvider = null;
const environment = new Environment({
  handlerProvider, // Can omit.
  network,
  store
});

function manualReadRecordSource(recordSource) {
  const root = recordSource.get('client:root');
  const hero = recordSource.get(recordSource.get('client:root').hero.__ref);

  return {
    hero: {
      id: hero.id,
      name: hero.name,
      friends: hero.friends.__refs.map(ref => {
        const friend = recordSource.get(ref);

        return {
          id: friend.id,
          name: friend.name,
          appearsIn: friend.appearsIn,
          __typename: friend.__typename
        };
      }),
      __typename: hero.__typename
    }
  };
}

function manualRead(cache) {
  const hero = cache[cache["ROOT_QUERY"].hero.id];
  return {
    hero: {
      id: hero.id,
      name: hero.name,
      friends: hero.friends.map(friendId => {
        const friend = cache[friendId.id];
        return {
          id: friend.id,
          name: friend.name,
          appearsIn: friend.appearsIn.json,
          __typename: friend.__typename
        };
      }),
      __typename: hero.__typename
    }
  };
}

const q = graphql`
query srcQuery {
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
`();

const relayStore = environment.getStore();

function relayQuery() {
  return new Promise((resolve) => {
    environment.execute({
      operation: { node: q }
    }).subscribe({
      next(payload) {
        resolve();
      }
    });
  });
}

function apolloQuery() {
  return client.query({ query });
}


Promise.all([relayQuery(), apolloQuery()]).then(() => {
  const suite = new Benchmark.Suite();
  const cache = client.cache.extract();
  const relayRecordSource = relayStore.getSource();
  const relaySelector = { dataID: 'client:root', node: q.fragment };
  const apolloQuery = { query };

  console.log(JSON.stringify(cache, null, 2));
  console.log("Apollo", JSON.stringify(client.readQuery(apolloQuery), null, 2));
  console.log('RELAY', JSON.stringify(relayStore.lookup(relaySelector).data, null, 2));
  console.log("Manual POJO", JSON.stringify(manualRead(cache), null, 2));
  console.log("Manual Record Source", JSON.stringify(manualReadRecordSource(relayRecordSource), null, 2));
  console.log(
    "Iguales??",
    JSON.stringify(client.readQuery(apolloQuery), null, 2) ===
      JSON.stringify(manualRead(cache), null, 2)
  );
  // return;
  // add tests
  suite
    .add("Apollo client readQuery", function() {
      client.readQuery(apolloQuery);
    })
    .add("Relay client readQuery", function() {
      relayStore.lookup(relaySelector)
    })
    .add("Manual readQuery with POJO cache", function() {
      manualRead(cache);
    })
    .add("Manual readQuery with Relay recordSource", function() {
      manualReadRecordSource(relayRecordSource);
    })
    .on("complete", function() {
      console.log(this[0].toString());
      console.log(this[1].toString());
      console.log(this[2].toString());
      console.log(this[3].toString());
      console.log("Fastest is " + this.filter("fastest").map("name"));
    })
    // run async
    .run({ async: true });
});
