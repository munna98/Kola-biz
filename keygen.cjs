
const { generateKeyPairSync } = require('crypto');
try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { format: 'der', type: 'spki' },
        privateKeyEncoding: { format: 'der', type: 'pkcs8' }
    });

    // SPKI (Public): 12 bytes header + 32 bytes key
    const rawPublic = publicKey.slice(publicKey.length - 32);

    // PKCS8 (Private): 16 bytes header + 32 bytes key
    const rawPrivate = privateKey.slice(privateKey.length - 32);

    console.log("PRIVATE_KEY:" + rawPrivate.toString('hex'));
    console.log("PUBLIC_KEY:" + rawPublic.toString('hex'));

} catch (e) {
    console.error(e);
}
