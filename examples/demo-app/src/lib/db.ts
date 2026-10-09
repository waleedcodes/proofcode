export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export interface Order {
  id: string;
  userId: string;
  amount: number;
