import { Dashboard } from './dashboard.js';
import { Transactions } from './transactions.js';
import { Budget } from './budget.js';
import { Bills } from './bills.js';
import { Accounts } from './accounts.js';
import { Categories } from './categories.js';
import { Tags } from './tags.js';
import { Data } from './data.js';
import { ImportCsv } from './import.js';

export const views = {
  dashboard: Dashboard,
  transactions: Transactions,
  budget: Budget,
  bills: Bills,
  accounts: Accounts,
  categories: Categories,
  tags: Tags,
  data: Data,
  import: ImportCsv,
};
