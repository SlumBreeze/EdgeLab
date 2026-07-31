import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const signInWithGoogle = vi.fn();
let authState = {
  authRequired: true,
  configurationError: null as string | null,
  loading: false,
  session: null as { access_token: string } | null,
  user: null as { id: string } | null,
  signOut,
  signInWithGoogle,
};

vi.mock("../components/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../pages/WnbaDashboard", () => ({
  default: ({ sport }: { sport: string }) => <div>Dashboard {sport}</div>,
}));

import App from "../App";

describe("private frontend access gate", () => {
  beforeEach(() => {
    authState = {
      authRequired: true,
      configurationError: null,
      loading: false,
      session: null,
      user: null,
      signOut,
      signInWithGoogle,
    };
  });

  it("shows login instead of the dashboard without a session", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Sign in to EdgeLab" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard WNBA")).not.toBeInTheDocument();
  });

  it("fails closed when required frontend auth is not configured", () => {
    authState.configurationError = "Supabase Auth configuration is missing.";
    render(<App />);
    expect(screen.getByRole("heading", { name: "Authentication is not configured" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard WNBA")).not.toBeInTheDocument();
  });

  it("renders the dashboard for an authenticated user", () => {
    authState.session = { access_token: "test-access-token" };
    authState.user = { id: "authorized-user-id" };
    render(<App />);
    expect(screen.getByText("Dashboard WNBA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("keeps local opt-out development usable", () => {
    authState.authRequired = false;
    render(<App />);
    expect(screen.getByText("Dashboard WNBA")).toBeInTheDocument();
  });
});
