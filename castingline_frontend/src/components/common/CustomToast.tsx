import { InfoIcon, WarningIcon, CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import React, {
    createContext,
    useContext,
    useMemo,
    useRef,
    useState,
    useEffect,
    ReactNode,
    HTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import styled, { keyframes, css } from "styled-components";
import CircleIconImg from "../../assets/img/alert/CheckCircle.png";

export type ToastVariant = "success" | "error" | "warning" | "info";
export type ToastPosition = "top-center" | "one-third-center" | "bottom-center";

export type ToastOptions = {
    id?: string;
    message: React.ReactNode;
    variant?: ToastVariant;
    duration?: number;
    position?: ToastPosition;
};

type ToastContextValue = {
    show: (opts: ToastOptions) => string;
    hide: (id: string) => void;
    success: (message: React.ReactNode, duration?: number) => string;
    error: (message: React.ReactNode, duration?: number) => string;
    warning: (message: React.ReactNode, duration?: number) => string;
    info: (message: React.ReactNode, duration?: number) => string;
};

type ToastStackProps = HTMLAttributes<HTMLDivElement> & {
    position: ToastPosition;
    children: ReactNode;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within <CustomToastProvider>");
    return ctx;
}

type InternalToast = Required<Omit<ToastOptions, "id">> & {
    id: string;
    createdAt: number;
};

const DEFAULT_DURATION = 2500;
const DEFAULT_POSITION: ToastPosition = "top-center";

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

export function CustomToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<InternalToast[]>([]);
    const timersRef = useRef<Record<string, number>>({});

    const hide = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timersRef.current[id];
        if (timer) {
            window.clearTimeout(timer);
            delete timersRef.current[id];
        }
    };

    const show = (opts: ToastOptions) => {
        const id = opts.id ?? uid();
        const toast: InternalToast = {
            id,
            message: opts.message,
            variant: opts.variant ?? "info",
            duration: opts.duration ?? DEFAULT_DURATION,
            position: opts.position ?? DEFAULT_POSITION,
            createdAt: Date.now(),
        };
        setToasts((prev) => [...prev, toast]);

        timersRef.current[id] = window.setTimeout(() => hide(id), toast.duration);
        return id;
    };

    const value = useMemo(
        () => ({
            show,
            hide,
            success: (m, d) => show({ message: m, variant: "success", duration: d }),
            error: (m, d) => show({ message: m, variant: "error", duration: d }),
            warning: (m, d) => show({ message: m, variant: "warning", duration: d }),
            info: (m, d) => show({ message: m, variant: "info", duration: d }),
        }),
        []
    );

    useEffect(
        () => () => {
            Object.values(timersRef.current).forEach(clearTimeout);
        },
        []
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            {createPortal(
                <>
                    <ToastStack position="top-center">
                        {toasts
                            .filter((t) => t.position === "top-center")
                            .map((t) => (
                                <ToastItem key={t.id} toast={t} onExit={() => hide(t.id)} />
                            ))}
                    </ToastStack>

                    <ToastStack position="one-third-center">
                        {toasts
                            .filter((t) => t.position === "one-third-center")
                            .map((t) => (
                                <ToastItem key={t.id} toast={t} onExit={() => hide(t.id)} />
                            ))}
                    </ToastStack>

                    <ToastStack position="bottom-center">
                        {toasts
                            .filter((t) => t.position === "bottom-center")
                            .map((t) => (
                                <ToastItem key={t.id} toast={t} onExit={() => hide(t.id)} />
                            ))}
                    </ToastStack>
                </>,
                document.body
            )}
        </ToastContext.Provider>
    );
}

const slideIn = {
    "top-center": keyframes`
        from { transform: translate(-50%, -8px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    `,
    "one-third-center": keyframes`
        from { transform: translate(-50%, -8px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    `,
    "bottom-center": keyframes`
        from { transform: translate(-50%, 8px); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    `,
};

const Stack = styled.div<{ $position: ToastPosition }>`
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;

    ${({ $position }) =>
        $position === "top-center"
            ? css`
                  top: 24px;
                  animation: ${slideIn["top-center"]} 160ms ease-out;
              `
            : $position === "one-third-center"
            ? css`
                  top: 33%;
                  animation: ${slideIn["one-third-center"]} 160ms ease-out;
              `
            : css`
                  bottom: 24px;
                  animation: ${slideIn["bottom-center"]} 160ms ease-out;
              `}
`;

function ToastStack({ position, children, ...rest }: ToastStackProps) {
    return (
        <Stack $position={position} {...rest}>
            {children}
        </Stack>
    );
}

const toastEnter = keyframes`
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
`;

const toastExit = keyframes`
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-6px); }
`;

const Bar = styled.div<{ $visible: boolean; $color: string }>`
    width: 100%;
    max-width: 560px;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 8px;

    display: inline-flex;
    align-items: center;
    gap: 8px;

    pointer-events: auto;
    color: white;

    animation: ${({ $visible }) =>
        $visible
            ? css`
                  ${toastEnter} 200ms ease-out
              `
            : css`
                  ${toastExit} 200ms ease-in
              `};
`;

const Row = styled.div`
    flex: 1 1 0;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const IconBox = styled.div`
    width: 24px;
    height: 24px;
`;

const Text = styled.span`
    color: white;
    font-size: 16px;
    font-family: SUIT;
    font-weight: 500;
    letter-spacing: 0.16px;
    line-height: 24px;
`;

function ToastItem({ toast, onExit }: { toast: InternalToast; onExit: () => void }) {
    const [visible, setVisible] = useState(true);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onExit, 200);
    };

    const renderIcon = () => {
        if (toast.variant === "success") return <img src={CircleIconImg} />;

        if (toast.variant === "error") return <XCircleIcon size={24} color="#F04438" />;
        if (toast.variant === "warning") return <WarningIcon size={24} color="#F79009" />;
        return <InfoIcon size={24} color="#2E90FA" />;
    };

    return (
        <Bar $visible={visible} $color="" onClick={handleClose}>
            <Row>
                <IconBox>{renderIcon()}</IconBox>
                <Text>{toast.message}</Text>
            </Row>
        </Bar>
    );
}
