/**
 * @filename : ScheduleState.ts
 * @description :
 */
import { atom } from "recoil";
import { recoilPersist } from "recoil-persist";

const { persistAtom } = recoilPersist({
  key: "GlobalAlertState",
  storage: sessionStorage,
  converter: JSON,
});

export const GlobalAlertState = atom({
  key: "GlobalAlertState",
  default: {
    isOpen: false,
    title: "",
    subTitle: "",
    img: null,
    showConfirmBtn : true,
    showCancelBtn: false,
    onConfirm: () => {},
    onClose: () => {},
  },
  effects_UNSTABLE: [persistAtom],
});
