export interface ComposeTemplate {
	id: string;
	subject: string | null;
	htmlBody: string | null;
	textBody: string | null;
}

export interface TemplateMenuProps {
	onApply: (template: { title: string; html: string }) => void;
	onNew: () => void;
}

export interface NewTemplateDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mailboxId?: string | null;
	from: string;
}
