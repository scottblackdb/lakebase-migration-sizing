import { createContext, useContext, type ReactNode } from "react";

/** undefined = loading; null = not signed in; string = email from proxy. */
export type CurrentUserState = string | null | undefined;

const CurrentUserContext = createContext<CurrentUserState>(undefined);

export function CurrentUserProvider({
  value,
  children,
}: {
  value: CurrentUserState;
  children: ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserState {
  return useContext(CurrentUserContext);
}
