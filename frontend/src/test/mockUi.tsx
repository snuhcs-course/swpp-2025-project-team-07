import React from 'react';
import { vi } from 'vitest';

const Div: React.FC<any> = ({ children, ...props }) => <div {...props}>{children}</div>;

vi.mock('../components/ui/card', () => ({
  Card: Div,
  CardHeader: Div,
  CardContent: Div,
  CardDescription: Div,
  CardTitle: Div,
}));

vi.mock('../components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('../components/ui/label', () => ({
  Label: ({ children, htmlFor, ...props }: any) => (
    <label htmlFor={htmlFor} {...props}>
      {children}
    </label>
  ),
}));

vi.mock('../components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      {...props}
      role="switch"
      type="checkbox"
      checked={checked}
      onChange={() => onCheckedChange?.(!checked)}
    />
  ),
}));

vi.mock('../components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('../components/ui/avatar', () => ({
  Avatar: Div,
  AvatarFallback: ({ children }: any) => <div>{children}</div>,
  AvatarImage: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('../components/ui/dialog', () => ({
  Dialog: Div,
  DialogContent: Div,
  DialogDescription: Div,
  DialogFooter: Div,
  DialogHeader: Div,
  DialogTitle: Div,
}));

vi.mock('../components/ui/progress', () => ({
  Progress: ({ value, ...props }: any) => (
    <div data-testid="progress" data-value={value} {...props} />
  ),
}));

vi.mock('../components/ui/alert', () => ({
  Alert: Div,
  AlertDescription: Div,
}));

vi.mock('../components/ui/scroll-area', () => ({
  ScrollArea: Div,
}));

vi.mock('../components/ui/dropdown-menu', () => {
  const DropdownMenu = ({ children }: any) => <div>{children}</div>;
  const DropdownMenuTrigger = ({ children, asChild, ...props }: any) => (
    React.isValidElement(children)
      ? React.cloneElement(children, { ...props, ...children.props })
      : <div {...props}>{children}</div>
  );
  const DropdownMenuContent = ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  );
  const DropdownMenuItem = ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  );
  const DropdownMenuSeparator = () => <hr />;
  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
  };
});
