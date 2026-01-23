import ReactDOM from "react-dom/client";
import router from "./router/Router";
import GlobalStyles from "./styles/GlobalStyles";
import { RouterProvider } from "react-router-dom";
import React, { Suspense } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { RecoilRoot } from "recoil";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    // <React.StrictMode>
    <>
        <RecoilRoot>
            <DndProvider backend={HTML5Backend}>
                <Suspense>
                    <GlobalStyles />
                    <RouterProvider router={router} />
                </Suspense>
            </DndProvider>
        </RecoilRoot>
    </>
    // </React.StrictMode>
);

// import React from "react";
// import ReactDOMClient from "react-dom/client";
// import { VerticalNavigationScreen } from "./screens/VerticalNavigationScreen";

// const app = document.getElementById("app");
// const root = ReactDOMClient.createRoot(app);
// root.render(<VerticalNavigationScreen />);
