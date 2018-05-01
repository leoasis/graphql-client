/**
 * @flow
 * @relayHash 3fd865ddc282d8189020882cd3de8636
 */

/* eslint-disable */

'use strict';

/*::
import type { ConcreteRequest } from 'relay-runtime';
export type Episode = "EMPIRE" | "JEDI" | "NEWHOPE" | "%future added value";
export type srcQueryVariables = {||};
export type srcQueryResponse = {|
  +hero: ?{|
    +id: string,
    +name: string,
    +friends: ?$ReadOnlyArray<?{|
      +id: string,
      +name: string,
      +appearsIn: $ReadOnlyArray<?Episode>,
    |}>,
  |}
|};
*/


/*
query srcQuery {
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
*/

const node/*: ConcreteRequest*/ = (function(){
var v0 = {
  "kind": "ScalarField",
  "alias": null,
  "name": "id",
  "args": null,
  "storageKey": null
},
v1 = {
  "kind": "ScalarField",
  "alias": null,
  "name": "name",
  "args": null,
  "storageKey": null
},
v2 = {
  "kind": "ScalarField",
  "alias": null,
  "name": "appearsIn",
  "args": null,
  "storageKey": null
},
v3 = {
  "kind": "ScalarField",
  "alias": null,
  "name": "__typename",
  "args": null,
  "storageKey": null
};
return {
  "kind": "Request",
  "operationKind": "query",
  "name": "srcQuery",
  "id": null,
  "text": "query srcQuery {\n  hero {\n    __typename\n    id\n    name\n    friends {\n      __typename\n      id\n      name\n      appearsIn\n    }\n  }\n}\n",
  "metadata": {},
  "fragment": {
    "kind": "Fragment",
    "name": "srcQuery",
    "type": "Query",
    "metadata": null,
    "argumentDefinitions": [],
    "selections": [
      {
        "kind": "LinkedField",
        "alias": null,
        "name": "hero",
        "storageKey": null,
        "args": null,
        "concreteType": null,
        "plural": false,
        "selections": [
          v0,
          v1,
          {
            "kind": "LinkedField",
            "alias": null,
            "name": "friends",
            "storageKey": null,
            "args": null,
            "concreteType": null,
            "plural": true,
            "selections": [
              v0,
              v1,
              v2
            ]
          }
        ]
      }
    ]
  },
  "operation": {
    "kind": "Operation",
    "name": "srcQuery",
    "argumentDefinitions": [],
    "selections": [
      {
        "kind": "LinkedField",
        "alias": null,
        "name": "hero",
        "storageKey": null,
        "args": null,
        "concreteType": null,
        "plural": false,
        "selections": [
          v3,
          v0,
          v1,
          {
            "kind": "LinkedField",
            "alias": null,
            "name": "friends",
            "storageKey": null,
            "args": null,
            "concreteType": null,
            "plural": true,
            "selections": [
              v3,
              v0,
              v1,
              v2
            ]
          }
        ]
      }
    ]
  }
};
})();
// prettier-ignore
(node/*: any*/).hash = 'b5202c9068f3e94b8f4ad2c648b9a65d';
module.exports = node;
