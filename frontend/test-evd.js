const {
  Client,
  SecretKey,
  SwitchingKey,
  AutedModPackKeys,
  AutedModPackMLWEKeys,
  Message,
  MLWECiphertext,
  Server,
  CachedQuery,
  CachedKeys,
  Ciphertext,
} = require('./src/encryption/evd/build/Release/evd_node.node');

const LOG_RANK = 7;
const RANK = 1 << LOG_RANK;
const DEGREE = 4096;
const LOG_SCALE = 26.25;

function randomNormalizedVector(size) {
  const vec = Array.from({ length: size }, () => (Math.random() * 256 - 128) / 128);
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}

function messageFromArray(arr) {
  const msg = new Message(arr.length);
  arr.forEach((v, i) => msg.set(i, v));
  return msg;
}

function approxEqual(a, b, epsilon = 1e-3) {
  return Math.abs(a - b) <= epsilon;
}

(async () => {
  const client = new Client(LOG_RANK);
  const secret = new SecretKey();
  const relinKey = new SwitchingKey();
  const auted = new AutedModPackKeys(RANK);
  const autedMLWE = new AutedModPackMLWEKeys(RANK);

  client.genSecKey(secret);
  client.genRelinKey(relinKey, secret);
  client.genAutedModPackKeys(auted, secret);
  client.genInvAutedModPackKeys(autedMLWE, secret);

  const queryVec = randomNormalizedVector(RANK);
  const keyVecs = Array.from({ length: DEGREE }, () => randomNormalizedVector(RANK));

  const queryMsg = messageFromArray(queryVec);
  const keyMsgs = keyVecs.map(messageFromArray);
  const scale = 2 ** LOG_SCALE;

  const encQuery = new MLWECiphertext(RANK);
  client.encryptQuery(encQuery, queryMsg, secret, scale);

  const encKeys = keyMsgs.map((msg) => {
    const key = new MLWECiphertext(RANK);
    client.encryptKey(key, msg, secret, scale);
    return key;
  });

  const server = new Server(LOG_RANK, relinKey, auted, autedMLWE);
  const queryCache = new CachedQuery(RANK);
  const keyCache = new CachedKeys(RANK);

  server.cacheQuery(queryCache, encQuery);
  server.cacheKeys(keyCache, encKeys);

  const resultCiphertext = new Ciphertext();
  server.innerProduct(resultCiphertext, queryCache, keyCache);

  const decryptedMsg = new Message(DEGREE);
  const doubleScale = 2 ** (2 * LOG_SCALE);
  client.decrypt(decryptedMsg, resultCiphertext, secret, doubleScale);

  const expected = keyVecs.map((kv) => kv.reduce((acc, v, i) => acc + v * queryVec[i], 0));
  const maxDiff = expected.reduce(
    (max, v, i) => Math.max(max, Math.abs(v - decryptedMsg.get(i))),
    0
  );

  console.log('Max difference vs expected inner product:', maxDiff);
  if (!approxEqual(maxDiff, 0, 1e-2)) {
    throw new Error(`max difference too large: ${maxDiff}`);
  }
  console.log('Inner product test passed!');
})();

