import { createGlobalStyle } from "styled-components";

export const GlobalStyles = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body, #root {
    height: 100%;
  }

  body {
    font-family: ${({ theme }) => theme.fonts.body};
    background: ${({ theme }) => theme.colors.surface.bg};
    color: ${({ theme }) => theme.colors.text.secondary};
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  a {
    color: ${({ theme }) => theme.colors.primary.main};
    text-decoration: none;

    &:hover {
      color: ${({ theme }) => theme.colors.primary.hover};
    }
  }

  button {
    cursor: pointer;
    font-family: inherit;
  }

  code, pre {
    font-family: ${({ theme }) => theme.fonts.mono};
  }

  ::selection {
    background: ${({ theme }) => theme.colors.primary.subtle};
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;
