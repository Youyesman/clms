import { useSetRecoilState, useResetRecoilState } from "recoil";
import ErrorAlertImg from "../assets/ErrorAlertImg.png";
import { GlobalAlertState } from "./GlobalAlertState";

export function useAppAlert() {
    const setGlobalAlertState = useSetRecoilState(GlobalAlertState);

    const showAlert = (
        title: string,
        subTitle?: string,
        type?: string,
        onConfirmCallback?: () => void,
        showCancelBtn: boolean = false
    ) => {
        setGlobalAlertState((prev) => ({
            ...prev,
            isOpen: true,
            title,
            subTitle,
            type,
            showCancelBtn,
            onConfirm: onConfirmCallback || (() => { }),
            onClose: () => { },
        }));
    };

    return { showAlert };
}
