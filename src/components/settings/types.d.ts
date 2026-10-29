export interface ProfileFormProps {
	initialName: string;
	initialResetEmail: string;
	email: string;
}

export interface ProfileFormResponse {
	user?: {
		name: string;
		timeZone: string | null;
		resetEmail: string | null;
		forwardingEmail: string | null;
		canForwardEmail: boolean;
	};
	error?: unknown;
}

export interface AccountSettingsResponse {
	user?: {
		id: string;
		email: string;
		name: string;
		timeZone: string | null;
		resetEmail: string | null;
		forwardingEmail: string | null;
		canForwardEmail: boolean;
	};
	error?: unknown;
}

export interface MfaStatusResponse {
	enabled: boolean;
	confirmedAt: string | null;
	recoveryCodesLeft: number;
	error?: unknown;
}

export interface MfaEnrollmentResponse {
	secret?: string;
	otpauthUrl?: string;
	qrSvg?: string;
	error?: unknown;
}

export interface MfaRecoveryCodesResponse {
	recoveryCodes?: string[];
	error?: unknown;
}

export interface ForwardingEmailFormProps {
	initialForwardingEmail: string;
}

export interface ForwardingEmailResponse {
	forwardingEmail?: string | null;
	error?: unknown;
}

export interface MailboxSignatureResponse {
	mailbox?: {
		id: string;
		localPart: string;
		hostname: string;
		displayName: string | null;
		signature: string | null;
		hasAvatar?: boolean;
		isPrimary?: boolean;
	};
	error?: unknown;
}

export interface MailboxAutoReplySettings {
	enabled: boolean;
	subject: string;
	body: string;
}

export interface MailboxAutoReplyResponse {
	mailbox?: {
		autoReplyEnabled: boolean;
		autoReplySubject: string;
		autoReplyBody: string;
	};
	error?: unknown;
}

export interface ChangePasswordResponse {
	error?: unknown;
}

export interface ProfileAvatarSessionResponse {
	user?: {
		hasAvatar?: boolean;
	};
}

export interface ProfileAvatarUploadResponse {
	error?: string;
}

export interface ProfileAvatarFormProps {
	mailboxId?: string;
	initialHasAvatar?: boolean;
	name?: string;
	colorSeed?: string;
}

export interface CurrentMailboxFormResponse {
	mailbox?: {
		id: string;
		domainId: string;
		localPart: string;
		hostname: string;
		displayName: string | null;
		signature?: string | null;
		hasAvatar?: boolean;
		isPrimary?: boolean;
	};
	error?: unknown;
}
