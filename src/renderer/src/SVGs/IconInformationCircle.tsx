import type { SVGProps } from "react";

export function IconInformationCircle(props: SVGProps<SVGSVGElement>): React.JSX.Element {
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" {...props}>
            <circle cx="16" cy="16" r="16" fill="#E8F9FF" />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M24 16C24 20.4183 20.4183 24 16 24C11.5817 24 8 20.4183 8 16C8 11.5817 11.5817 8 16 8C20.4183 8 24 11.5817 24 16ZM17 12C17 12.5523 16.5523 13 16 13C15.4477 13 15 12.5523 15 12C15 11.4477 15.4477 11 16 11C16.5523 11 17 11.4477 17 12ZM15 15C14.4477 15 14 15.4477 14 16C14 16.5523 14.4477 17 15 17V20C15 20.5523 15.4477 21 16 21H17C17.5523 21 18 20.5523 18 20C18 19.4477 17.5523 19 17 19V16C17 15.4477 16.5523 15 16 15H15Z"
                fill="#19c0ff"
            />
        </svg>
    );
}
