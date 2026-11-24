import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fail } from './service.mjs';
// Emissor local fixado pelo harness, nunca por claims/jku enviados pelo cliente.
export function createVerifier({ issuer, audience, jwksUrl }) {
    for (const value of [issuer, jwksUrl]) {
        const u = new URL(value);
        if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password) throw Error('EMISSOR_LOCAL_OBRIGATORIO');
    }
    const keys = createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 3000 });
    return async token => {
        try {
            if (typeof token !== 'string' || token.length > 8192) throw Error();
            const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256'], typ: 'at+jwt',
                requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: '10m', clockTolerance: 2 });
            if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 300) throw Error();
            return Object.freeze({ issuer: payload.iss, subject: payload.sub });
        } catch { fail(401, 'NAO_AUTENTICADO'); }
    };
}
