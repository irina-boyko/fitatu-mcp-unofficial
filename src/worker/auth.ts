/** Constant-time comparison of the bearer token against the configured secret. */
export function isAuthorized(authorizationHeader: string | null, expectedToken: string | undefined): boolean {
	if (!expectedToken || expectedToken.length < 32) {
		// Refuse to run without a strong token: an open endpoint would expose the whole Fitatu account.
		return false;
	}
	const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? "");
	if (!match) {
		return false;
	}
	return timingSafeEqualStrings(match[1].trim(), expectedToken);
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const left = encoder.encode(a);
	const right = encoder.encode(b);
	let diff = left.length ^ right.length;
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}
	return diff === 0;
}
