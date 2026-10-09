export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export interface Order {
  id: string;
  userId: string;
  amount: number;
}

export const db = {
  user: {
    findUnique: async (query: { where: { id: string } }) => {
      return { id: query.where.id, email: 'alex@example.com', passwordHash: '$2b$10$e8...' };
    }
  },
  order: {
    findUnique: async (query: { where: { id: string } }) => {
      return { id: query.where.id, userId: 'user-123', amount: 99.99 };
    },
    findMany: async () => {
      return [{ id: 'order-1', userId: 'user-123', amount: 49.0 }];
    }
  },
  query: async (sql: string) => {
    return { rows: [{ id: '1', sql }] };
  }
};
