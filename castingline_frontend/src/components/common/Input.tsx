// components/InfoInputRow.tsx
import React from 'react';

interface InfoWrapProps {
    children: React.ReactNode;
}

export const InfoWrap = ({ children }: InfoWrapProps) => {
    return <div className="info-wrap">{children}</div>;
};

interface InfoRowProps {
    label: string;
    children: React.ReactNode;
}

export const InfoRow = ({ label, children }: InfoRowProps) => {
    return (
        <div className="info-row">
            <span className="info-label">{label}</span>
            {children}
        </div>
    );
};
interface InfoInputRowProps {
    label: string;
    name: string;
    type?: 'text' | 'number' | 'checkbox' | 'date' | 'select' | 'custom';
    value?: any;
    onChange?: (e: React.ChangeEvent<any>) => void;
    options?: { label: string; value: string }[];
    children?: React.ReactNode; // custom 컴포넌트용
    disabled?: boolean
}

export const InfoInputRow = ({
    label,
    name,
    type = 'text',
    value,
    onChange = () => { },
    options,
    children,
    disabled = false
}: InfoInputRowProps) => {
    const renderInput = () => {
        if (type === 'custom') return children;

        if (type === 'select') {
            return (
                <select
                    className="input info-input"
                    name={name}
                    value={value || ''}
                    onChange={onChange}
                >
                    <option value="">선택</option>
                    {options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            );
        }

        return (
            <input
                className="input info-input"
                type={type}
                name={name}
                value={type === 'checkbox' ? undefined : value || ''}
                checked={type === 'checkbox' ? value || false : undefined}
                onChange={onChange}
                disabled
            />
        );
    };

    return (
        <div className="info-row">
            <span className="info-label">{label}</span>
            {renderInput()}
        </div>
    );
};