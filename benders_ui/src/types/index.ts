export const Role = {
  USER: 'user',
  AGENT: 'agent',
  THINKING: 'thinking',
  ERROR: 'error',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export interface Message {
  id: string;
  role: Role;
  content: string;
  isStreaming: boolean;
  timestamp?: number;
}
