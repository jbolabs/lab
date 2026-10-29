export interface ResizeHandleProps {
	label: string;
	onResizeStart?: () => void;
	onResize: (delta: number) => void;
	onResizeEnd?: () => void;
}
