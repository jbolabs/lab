export type AuthFetchOptions = RequestInit & {
	redirectOnUnauthorized?: boolean;
};

export interface AuthSessionResponse {
	ok?: boolean;
	token?: string;
	redirect?: string;
	error?: string;
}

export interface AuthSessionChangedDetail {
	authenticated: boolean;
}
