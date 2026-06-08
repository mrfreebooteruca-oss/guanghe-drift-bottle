import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { App, ClerkApp } from "./App";
import "./styles/app.css";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (clerkKey) {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkKey}>
        <ClerkApp />
      </ClerkProvider>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
