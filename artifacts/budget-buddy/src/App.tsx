import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  HeartPulse,
  Home,
  Leaf,
  Menu,
  MoreHorizontal,
  PencilLine,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Utensils,
  Upload,
  Wallet,
  Waves,
  X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

type TransactionType = 'income' | 'expense';
type BudgetCategory = { id: string; name: string; icon: string; color: string; planned: number };
type Budget = { month: string; income: number; categories: BudgetCategory[] };
type Transaction = { id: string; type: TransactionType; description: string; category: string; amount: number; date: string; goalId?: string; recurringId?: string };
type SavingsGoal = { id: string; name: string; target: number };
type RecurringTemplate = { id: string; description: string; type: TransactionType; amount: number; day: number; category: string };
type BudgetData = { budgets: Budget[]; activeMonth: string; transactions: Transaction[]; hasStarted: boolean; goals: SavingsGoal[]; recurringTemplates: RecurringTemplate[]; spendingAlerts: boolean };
type BudgetBackup = { app: 'budget-buddy'; version: 1; exportedAt: string; data: BudgetData };

const queryClient = new QueryClient();
const STORAGE_KEY = 'budget-buddy-data-v1';
const iconMap = {
  home: Home,
  food: Utensils,
  transport: Waves,
  wellness: HeartPulse,
  fun: Sparkles,
  future: Leaf,
  work: Banknote,
  other: MoreHorizontal,
};
type IconName = keyof typeof iconMap;

const monthKey = new Date().toISOString().slice(0, 7);
const monthLabel = (key: string) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${key}-01T12:00:00`));
const monthLastDay = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return `${key}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
};
const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const moneyPrecise = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));

const seedBudget: Budget = {
  month: monthKey,
  income: 0,
  categories: [
    { id: 'home', name: 'Home', icon: 'home', color: '#739a8b', planned: 0 },
    { id: 'food', name: 'Food & groceries', icon: 'food', color: '#db927c', planned: 0 },
    { id: 'transport', name: 'Getting around', icon: 'transport', color: '#7d9cad', planned: 0 },
    { id: 'wellness', name: 'Wellbeing', icon: 'wellness', color: '#b69dca', planned: 0 },
    { id: 'fun', name: 'Good things', icon: 'fun', color: '#d3ae63', planned: 0 },
    { id: 'future', name: 'Future you', icon: 'future', color: '#82aa72', planned: 0 },
  ],
};

const seedTransactions: Transaction[] = [];

const upsertBudget = (budgets: Budget[], budget: Budget) =>
  [...budgets.filter((item) => item.month !== budget.month), budget].sort((a, b) => a.month.localeCompare(b.month));
const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => {
  const merged = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
};
const budgetForMonth = (budgets: Budget[], month: string) =>
  budgets.find((item) => item.month === month) ??
  [...budgets].filter((item) => item.month < month).sort((a, b) => b.month.localeCompare(a.month))[0] ??
  [...budgets].sort((a, b) => a.month.localeCompare(b.month))[0] ??
  seedBudget;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isMonthKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const hasUniqueIds = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
const isTransactionType = (value: unknown): value is TransactionType =>
  value === 'income' || value === 'expense';
const isBudgetCategory = (value: unknown): value is BudgetCategory =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.icon === 'string' &&
  typeof value.color === 'string' &&
  isNonNegativeNumber(value.planned);
const isBudget = (value: unknown): value is Budget =>
  isRecord(value) &&
  isMonthKey(value.month) &&
  isNonNegativeNumber(value.income) &&
  Array.isArray(value.categories) &&
  value.categories.length > 0 &&
  value.categories.every(isBudgetCategory) &&
  hasUniqueIds(value.categories);
const isTransaction = (value: unknown): value is Transaction =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  isTransactionType(value.type) &&
  typeof value.description === 'string' &&
  typeof value.category === 'string' &&
  isPositiveNumber(value.amount) &&
  isDateKey(value.date) &&
  (!('goalId' in value) || typeof value.goalId === 'string') &&
  (!('recurringId' in value) || typeof value.recurringId === 'string');
const isSavingsGoal = (value: unknown): value is SavingsGoal =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  isPositiveNumber(value.target);
const isRecurringTemplate = (value: unknown): value is RecurringTemplate =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.description === 'string' &&
  isTransactionType(value.type) &&
  isPositiveNumber(value.amount) &&
  typeof value.day === 'number' &&
  Number.isInteger(value.day) &&
  value.day >= 1 &&
  value.day <= 31 &&
  typeof value.category === 'string';

function parseBudgetBackup(contents: string): BudgetBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('That file is not valid JSON. Choose a Budget Buddy backup file.');
  }
  if (!isRecord(parsed) || parsed.app !== 'budget-buddy') {
    throw new Error('This file is not a Budget Buddy backup.');
  }
  if (parsed.version !== 1) {
    throw new Error('This backup version is not supported by this copy of Budget Buddy.');
  }
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt)) || !isRecord(parsed.data)) {
    throw new Error('The backup is missing its export date or data.');
  }
  const data = parsed.data;
  if (
    !Array.isArray(data.budgets) ||
    data.budgets.length === 0 ||
    !data.budgets.every(isBudget) ||
    !hasUniqueIds(data.budgets.map((budget) => ({ id: budget.month }))) ||
    !isMonthKey(data.activeMonth) ||
    !data.budgets.some((budget) => budget.month === data.activeMonth) ||
    !Array.isArray(data.transactions) ||
    !data.transactions.every(isTransaction) ||
    !hasUniqueIds(data.transactions) ||
    typeof data.hasStarted !== 'boolean' ||
    !Array.isArray(data.goals) ||
    !data.goals.every(isSavingsGoal) ||
    !hasUniqueIds(data.goals) ||
    !Array.isArray(data.recurringTemplates) ||
    !data.recurringTemplates.every(isRecurringTemplate) ||
    !hasUniqueIds(data.recurringTemplates) ||
    typeof data.spendingAlerts !== 'boolean'
  ) {
    throw new Error('The backup data is incomplete or invalid. No data was changed.');
  }
  return {
    app: 'budget-buddy',
    version: 1,
    exportedAt: parsed.exportedAt,
    data: {
      budgets: data.budgets,
      activeMonth: data.activeMonth,
      transactions: data.transactions,
      hasStarted: data.hasStarted,
      goals: data.goals,
      recurringTemplates: data.recurringTemplates,
      spendingAlerts: data.spendingAlerts,
    },
  };
}

const previousSampleTransactions: Array<{
  id: string;
  type: TransactionType;
  description: string;
  category: string;
  amount: number;
  day: string;
}> = [
  { id: 't-1', type: 'income', description: 'Salary', category: 'Income', amount: 4280, day: '01' },
  { id: 't-2', type: 'expense', description: 'Rent', category: 'Home', amount: 980, day: '02' },
  { id: 't-3', type: 'expense', description: 'Market groceries', category: 'Food & groceries', amount: 86.4, day: '04' },
  { id: 't-4', type: 'expense', description: 'Train pass', category: 'Getting around', amount: 72, day: '05' },
  { id: 't-5', type: 'expense', description: 'Pilates studio', category: 'Wellbeing', amount: 42, day: '07' },
  { id: 't-6', type: 'expense', description: 'Dinner with Maya', category: 'Good things', amount: 64.8, day: '09' },
];

function loadData(): BudgetData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        budget?: Budget;
        budgets?: Budget[];
        activeMonth?: string;
        transactions?: Transaction[];
        hasStarted?: boolean;
        goals?: SavingsGoal[];
        recurringTemplates?: RecurringTemplate[];
        spendingAlerts?: boolean;
      };
      const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : seedTransactions;
      const legacyBudget = parsed.budget ?? parsed.budgets?.[0] ?? seedBudget;
      const samplePlan = [1240, 520, 220, 180, 260, 600];
      const isUntouchedSample =
        !parsed.budgets &&
        parsed.budget?.income === 4280 &&
        Array.isArray(parsed.budget.categories) &&
        parsed.budget.categories.length === samplePlan.length &&
        parsed.budget.categories.every((category, index) =>
          category.id === seedBudget.categories[index]?.id && category.planned === samplePlan[index],
        ) &&
        transactions.length === previousSampleTransactions.length &&
        transactions.every((transaction, index) =>
          transaction.id === previousSampleTransactions[index]?.id &&
          transaction.type === previousSampleTransactions[index]?.type &&
          transaction.description === previousSampleTransactions[index]?.description &&
          transaction.category === previousSampleTransactions[index]?.category &&
          transaction.amount === previousSampleTransactions[index]?.amount &&
          transaction.date === `${legacyBudget.month}-${previousSampleTransactions[index]?.day}`,
        );
      if (isUntouchedSample) {
        return { budgets: [seedBudget], activeMonth: seedBudget.month, transactions: seedTransactions, hasStarted: false, goals: [], recurringTemplates: [], spendingAlerts: false };
      }
      const budgets = parsed.budgets?.length ? parsed.budgets : [legacyBudget];
      const activeBudget =
        budgets.find((item) => item.month === parsed.activeMonth) ??
        budgets.find((item) => item.month === legacyBudget.month) ??
        budgets[0] ??
        seedBudget;
      return {
        budgets,
        activeMonth: activeBudget.month,
        transactions,
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        recurringTemplates: Array.isArray(parsed.recurringTemplates) ? parsed.recurringTemplates : [],
        spendingAlerts: parsed.spendingAlerts === true,
        hasStarted: parsed.hasStarted ?? (
          budgets.some((item) => item.income > 0 || item.categories.some((category) => category.planned > 0)) ||
          transactions.length > 0
        ),
      };
    }
  } catch {
    // localStorage can be unavailable in private browsing; the seeded state still works.
  }
  return { budgets: [seedBudget], activeMonth: seedBudget.month, transactions: seedTransactions, hasStarted: false, goals: [], recurringTemplates: [], spendingAlerts: false };
}

function useBudgetData() {
  const [data, setData] = useState(loadData);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);
  const budget = data.budgets.find((item) => item.month === data.activeMonth) ?? data.budgets[0] ?? seedBudget;
  return {
    ...data,
    budget,
    ready,
    setActiveMonth: (month: string) => setData((current) =>
      current.budgets.some((item) => item.month === month) ? { ...current, activeMonth: month } : current,
    ),
    setBudget: (updatedBudget: Budget) => setData((current) => ({
      ...current,
      budgets: upsertBudget(current.budgets, updatedBudget),
      activeMonth: updatedBudget.month,
    })),
    startBudget: (updatedBudget: Budget) => setData((current) => ({
      ...current,
      budgets: upsertBudget(current.budgets, updatedBudget),
      activeMonth: updatedBudget.month,
      hasStarted: true,
    })),
    addTransaction: (transaction: Transaction) => setData((current) => ({ ...current, transactions: [transaction, ...current.transactions] })),
    removeTransaction: (id: string) => setData((current) => ({ ...current, transactions: current.transactions.filter((item) => item.id !== id) })),
    addGoal: (goal: SavingsGoal) => setData((current) => ({ ...current, goals: [...current.goals, goal] })),
    addRecurringTemplate: (template: RecurringTemplate) => setData((current) => ({ ...current, recurringTemplates: [...current.recurringTemplates, template] })),
    removeRecurringTemplate: (id: string) => setData((current) => ({ ...current, recurringTemplates: current.recurringTemplates.filter((item) => item.id !== id) })),
    setSpendingAlerts: (enabled: boolean) => setData((current) => ({ ...current, spendingAlerts: enabled })),
    replaceData: (replacement: BudgetData) => setData(replacement),
    mergeData: (incoming: BudgetData) => setData((current) => {
      const budgets = incoming.budgets.reduce(upsertBudget, current.budgets);
      const activeMonth = budgets.some((item) => item.month === current.activeMonth)
        ? current.activeMonth
        : incoming.activeMonth;
      return {
        ...current,
        budgets,
        activeMonth,
        transactions: mergeById(current.transactions, incoming.transactions),
        hasStarted: current.hasStarted || incoming.hasStarted,
        goals: mergeById(current.goals, incoming.goals),
        recurringTemplates: mergeById(current.recurringTemplates, incoming.recurringTemplates),
      };
    }),
  };
}

function App() {
  const data = useBudgetData();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="grain">
          <AppRouter data={data} />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

type DataContext = ReturnType<typeof useBudgetData>;
function AppRouter({ data }: { data: DataContext }) {
  const [location, setLocation] = useLocation();
  if (location === '/') {
    return (
      <ErrorBoundary resetKey={location}>
        {data.hasStarted ? <Redirect to="/overview" /> : <WelcomePage onStart={() => setLocation('/start-budget')} />}
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary resetKey={location}>
      <Shell>
        <Switch>
          <Route path="/overview"><Overview data={data} /></Route>
          <Route path="/start-budget"><StartBudgetPage data={data} /></Route>
          <Route path="/budget"><BudgetPage data={data} /></Route>
          <Route path="/transactions"><TransactionsPage data={data} /></Route>
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </ErrorBoundary>
  );
}

function WelcomePage({ onStart }: { onStart: () => void }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f3ea] px-6">
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-36 h-96 w-96 rounded-full border-[56px] border-[#e9e3d6] opacity-70" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-28 h-[30rem] w-[30rem] rounded-full border-[64px] border-[#e5ece2] opacity-80" />
      <button
        type="button"
        onClick={onStart}
        className="animate-pop relative inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-[#315b4e] px-10 py-5 text-lg font-semibold text-[#f8f4e9] shadow-[0_16px_40px_rgba(49,91,78,.2)] transition hover:-translate-y-1 hover:bg-[#284d42] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dd977e]/50"
        data-testid="button-start-budgeting"
      >
        Start Budgeting <ChevronRight size={20} />
      </button>
    </main>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = [
    { href: '/overview', label: 'Overview', icon: BarChart3 },
    { href: '/start-budget', label: 'Start a budget', icon: CircleDollarSign },
    { href: '/budget', label: 'My budget', icon: PencilLine },
    { href: '/transactions', label: 'Transactions', icon: Receipt },
  ];
  return (
    <div className="app-shell flex">
      <aside className="desktop-sidebar sidebar fixed inset-y-0 left-0 z-20 flex w-[248px] flex-col px-5 py-7">
        <Link href="/overview" className="mb-14 flex items-center gap-3 px-2" data-testid="link-brand">
          <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#dd977e] text-[#25423b] shadow-[0_6px_18px_rgba(218,142,117,.2)]">
            <Wallet size={21} strokeWidth={2.2} />
          </div>
          <div>
            <div className="font-serif text-[22px] leading-none tracking-[-.03em]">Budget Buddy</div>
            <div className="mt-1 text-[10px] uppercase tracking-[.2em] text-[#a9c8b9]">A kinder money view</div>
          </div>
        </Link>
        <nav className="space-y-2" aria-label="Main navigation">
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.19em] text-[#85a89a]">Your space</div>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-medium ${location === href ? 'nav-link-active' : 'text-[#bed2c7]'}`}
              data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
              {location === href && <ChevronRight className="ml-auto" size={15} />}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-[#47675b] bg-[#2c5147] p-4">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#7ba996] text-[#204239]"><Waves size={16} /></div>
          <p className="font-serif text-[16px] leading-tight text-[#edf3ea]">Small steps count.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-[#afc9bc]">This is a snapshot, not a scorecard. Check in when it helps.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 md:ml-[248px]">
        <header className="mobile-nav sticky top-0 z-10 items-center justify-between border-b border-[#e5ded1] bg-[#f7f3ea]/95 px-5 py-4 backdrop-blur">
          <Link href="/overview" className="flex items-center gap-2.5" data-testid="link-mobile-brand">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#dd977e] text-[#25423b]"><Wallet size={17} /></div>
            <span className="font-serif text-[19px]">Budget Buddy</span>
          </Link>
          <button className="rounded-lg p-2 text-[#31574c]" onClick={() => setMobileOpen((open) => !open)} aria-label="Open navigation" data-testid="button-mobile-menu">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </header>
        {mobileOpen && (
          <div className="mobile-nav fixed inset-x-0 top-[65px] z-30 flex-col gap-1 border-b border-[#e5ded1] bg-[#f7f3ea] p-4 shadow-lg">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#31574c]" data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`}>
                <Icon size={18} />{label}
              </Link>
            ))}
          </div>
        )}
        <main className="mx-auto max-w-[1220px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
      </div>
    </div>
  );
}

function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="animate-rise mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.19em] text-[#b97561]"><span className="h-1.5 w-1.5 rounded-full bg-[#dd977e]" />{eyebrow}</div>
        <h1 className="font-serif text-[38px] leading-[1.04] tracking-[-.04em] text-[#25423b] sm:text-[50px]">{title}</h1>
      </div>
      {children}
    </div>
  );
}

function Overview({ data }: { data: DataContext }) {
  const { budget, budgets, setActiveMonth, transactions, addTransaction, goals, addGoal, spendingAlerts, setSpendingAlerts } = data;
  const [spendDescription, setSpendDescription] = useState('');
  const [spendCategory, setSpendCategory] = useState(budget.categories[0]?.name ?? 'Other');
  const [spendAmount, setSpendAmount] = useState('');
  const [spendDate, setSpendDate] = useState(budget.month === monthKey ? new Date().toISOString().slice(0, 10) : `${budget.month}-01`);
  const [spendFeedback, setSpendFeedback] = useState('');
  const [spendSuggestionsOpen, setSpendSuggestionsOpen] = useState(false);
  const [activeSpendSuggestion, setActiveSpendSuggestion] = useState(-1);
  const [incomeDescription, setIncomeDescription] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState(budget.month === monthKey ? new Date().toISOString().slice(0, 10) : `${budget.month}-01`);
  const [incomeFeedback, setIncomeFeedback] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalFeedback, setGoalFeedback] = useState('');
  const [contributionAmounts, setContributionAmounts] = useState<Record<string, string>>({});
  const allExpenses = useMemo(() => transactions.filter((item) => item.type === 'expense'), [transactions]);
  const monthTransactions = useMemo(
    () => transactions.filter((item) => item.date.slice(0, 7) === budget.month).sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, budget.month],
  );
  const expenses = useMemo(() => monthTransactions.filter((item) => item.type === 'expense'), [monthTransactions]);
  const savedSpendDescriptions = useMemo(() => {
    const seen = new Set<string>();
    return [...budget.categories.map((category) => category.name), ...allExpenses.map((item) => item.description)]
      .flatMap((value) => {
        const description = value.trim();
        const key = description.toLocaleLowerCase();
        if (!description || seen.has(key)) return [];
        seen.add(key);
        return [description];
      });
  }, [budget.categories, allExpenses]);
  const matchingSpendDescriptions = useMemo(() => {
    const query = spendDescription.trim().toLocaleLowerCase();
    if (!query) return [];
    return savedSpendDescriptions
      .filter((description) => description.toLocaleLowerCase().includes(query))
      .slice(0, 6);
  }, [savedSpendDescriptions, spendDescription]);
  const showSpendSuggestions =
    spendSuggestionsOpen && Boolean(spendDescription.trim()) && matchingSpendDescriptions.length > 0;
  const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const planned = budget.categories.reduce((sum, item) => sum + item.planned, 0);
  const remaining = budget.income - spent;
  const percentSpent = budget.income ? Math.min(100, Math.round((spent / budget.income) * 100)) : 0;
  const spentFor = (category: string) => expenses.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0);
  const earlierBudget = [...budgets].filter((item) => item.month < budget.month).sort((a, b) => b.month.localeCompare(a.month))[0];
  const earlierExpenses = earlierBudget
    ? transactions.filter((item) => item.type === 'expense' && item.date.slice(0, 7) === earlierBudget.month).reduce((sum, item) => sum + item.amount, 0)
    : 0;
  const addIncome = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(incomeAmount);
    if (!incomeDescription.trim() || !Number.isFinite(amount) || amount <= 0 || incomeDate.slice(0, 7) !== budget.month) return;
    addTransaction({ id: `t-${Date.now()}`, type: 'income', description: incomeDescription.trim(), category: 'Income', amount, date: incomeDate });
    setIncomeDescription('');
    setIncomeAmount('');
    setIncomeFeedback('Income added to actual activity');
    window.setTimeout(() => setIncomeFeedback(''), 2400);
  };
  const createGoal = (event: FormEvent) => {
    event.preventDefault();
    const target = Number(goalTarget);
    if (!goalName.trim() || !Number.isFinite(target) || target <= 0) return;
    addGoal({ id: `g-${Date.now()}`, name: goalName.trim(), target });
    setGoalName('');
    setGoalTarget('');
    setGoalFeedback('Savings goal created');
    window.setTimeout(() => setGoalFeedback(''), 2200);
  };
  const contributeToGoal = (goal: SavingsGoal) => {
    const amount = Number(contributionAmounts[goal.id]);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const goalCategory = budget.categories.find((item) => item.name === 'Future you')?.name ?? budget.categories[0]?.name ?? 'Other';
    addTransaction({
      id: `t-${Date.now()}`, type: 'expense', description: `Contribution · ${goal.name}`,
      category: goalCategory, amount, date: budget.month === monthKey
        ? new Date().toISOString().slice(0, 10)
        : `${budget.month}-01`, goalId: goal.id,
    });
    setContributionAmounts((current) => ({ ...current, [goal.id]: '' }));
  };
  useEffect(() => {
    setSpendDate(budget.month === monthKey ? new Date().toISOString().slice(0, 10) : `${budget.month}-01`);
    setIncomeDate(budget.month === monthKey ? new Date().toISOString().slice(0, 10) : `${budget.month}-01`);
    setSpendCategory(budget.categories[0]?.name ?? 'Other');
  }, [budget.month, budget.categories]);
  const addActualSpending = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(spendAmount);
    if (!spendDescription.trim() || !Number.isFinite(amount) || amount <= 0) return;
    addTransaction({
      id: `t-${Date.now()}`,
      type: 'expense',
      description: spendDescription.trim(),
      category: spendCategory,
      amount,
      date: spendDate,
    });
    setSpendDescription('');
    setSpendSuggestionsOpen(false);
    setActiveSpendSuggestion(-1);
    setSpendAmount('');
    setSpendFeedback('Spending added to your overview');
    window.setTimeout(() => setSpendFeedback(''), 2200);
  };
  return (
    <div>
      <PageIntro eyebrow="Your monthly check-in" title="A clear view of your money.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#778a80]" htmlFor="select-budget-history-month">
            View month
            <select
              id="select-budget-history-month"
              data-testid="select-budget-history-month"
              value={budget.month}
              onChange={(event) => setActiveMonth(event.target.value)}
              className="input-field rounded-xl px-3 py-2.5 text-[13px] font-semibold normal-case tracking-normal text-[#315b4e]"
            >
              {[...budgets].sort((a, b) => b.month.localeCompare(a.month)).map((item) => (
                <option key={item.month} value={item.month}>{monthLabel(item.month)}</option>
              ))}
            </select>
          </label>
          <Link href="/start-budget" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfc8b9] bg-[#fbf8f1] px-4 py-3 text-sm font-semibold text-[#315b4e] transition hover:-translate-y-0.5 hover:border-[#9eb4a5]" data-testid="link-start-budget">
            <CircleDollarSign size={17} /> Start a budget
          </Link>
          <Link href="/transactions" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#315b4e] px-4 py-3 text-sm font-semibold text-[#f8f4e9] shadow-[0_7px_18px_rgba(49,91,78,.15)] transition hover:-translate-y-0.5" data-testid="link-add-transaction">
            <Plus size={17} /> Add a transaction
          </Link>
        </div>
      </PageIntro>

      <section className="animate-rise delay-1 grid gap-4 lg:grid-cols-[1.35fr_1fr_1fr]">
        <div className="relative overflow-hidden rounded-[22px] bg-[#315b4e] p-6 text-[#f7f2e5] shadow-[0_15px_35px_rgba(49,91,78,.14)] sm:p-8">
          <div className="absolute -right-10 -top-12 h-44 w-44 rounded-full border-[24px] border-[#527b6a]/60" />
          <div className="absolute -bottom-24 right-20 h-48 w-48 rounded-full border-[18px] border-[#416c5c]/60" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[.18em] text-[#b6d1c0]">Money left over</div>
              <div className="flex items-center gap-1.5 rounded-full bg-[#426d5d] px-2.5 py-1 text-[11px] text-[#d8e7da]"><CalendarDays size={13} /> {monthLabel(budget.month)}</div>
            </div>
            <div className="mt-8 font-serif text-[48px] leading-none tracking-[-.04em] sm:text-[60px]" data-testid="text-remaining-balance">{money(remaining)}</div>
            <div className="mt-3 flex items-center gap-2 text-[13px] text-[#c6dccd]"><TrendingUp size={15} /> Left after {money(spent)} in actual spending</div>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-[#477363]"><div className="h-full rounded-full bg-[#e2a080] transition-all duration-700" style={{ width: `${Math.max(4, percentSpent)}%` }} /></div>
            <div className="mt-2 flex justify-between text-[11px] text-[#a9c9b9]"><span>{money(spent)} spent</span><span>{money(budget.income)} income</span></div>
          </div>
        </div>
        <StatCard label="Income" value={money(budget.income)} detail={`planned for ${monthLabel(budget.month)}`} icon={<ArrowDownLeft size={18} />} color="sage" testId="text-income-total" />
        <StatCard label="Planned spending" value={money(planned)} detail={`${money(Math.max(0, budget.income - planned))} left unassigned`} icon={<CircleDollarSign size={18} />} color="peach" testId="text-planned-total" />
      </section>

      <section className="paper-card animate-rise delay-2 mt-5 rounded-[22px] p-5 sm:p-7" aria-labelledby="month-comparison-title" data-testid="section-month-comparison">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#a66e59]">A little perspective</div><h2 id="month-comparison-title" className="mt-1 font-serif text-[24px] text-[#25423b]">Compared with last saved month</h2></div>
          {earlierBudget && <span className="text-[12px] text-[#83928a]" data-testid="text-comparison-period">{monthLabel(earlierBudget.month)} → {monthLabel(budget.month)}</span>}
        </div>
        {!earlierBudget ? <div className="rounded-2xl bg-[#f3eee5] px-4 py-5 text-[13px] leading-relaxed text-[#75877d]" data-testid="empty-month-comparison">Save a budget for an earlier month to unlock a month-to-month comparison. Each month keeps its own plan and activity.</div> : (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Planned income', current: budget.income, previous: earlierBudget.income, id: 'planned-income' },
              { label: 'Actual expenses', current: spent, previous: earlierExpenses, id: 'actual-expenses' },
              { label: 'Projected money left', current: budget.income - spent, previous: earlierBudget.income - earlierExpenses, id: 'projected-left' },
            ].map((metric) => {
              const difference = metric.current - metric.previous;
              return <div key={metric.id} className="rounded-2xl bg-[#f3eee5] p-4" data-testid={`comparison-metric-${metric.id}`}>
                <div className="text-[11px] font-bold uppercase tracking-[.12em] text-[#829087]">{metric.label}</div>
                <div className="mt-2 font-serif text-[26px] text-[#315247]">{money(metric.current)}</div>
                <div className="mt-1 text-[11px] text-[#839087]">Previously {money(metric.previous)} <span className={`ml-1 font-semibold ${difference > 0 ? 'text-[#a66e59]' : 'text-[#4d8069]'}`}>{difference > 0 ? '+' : difference < 0 ? '−' : '·'}{money(Math.abs(difference))}</span></div>
              </div>;
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-[#929990]">Income is the planned amount; expenses are actual transactions for each month.</p>
      </section>

      <section className="paper-card animate-rise delay-2 mt-5 rounded-[22px] p-5 sm:p-7" data-testid="section-quick-income">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-serif text-[24px] text-[#25423b]">Add income</h2><p className="mt-1 text-[13px] text-[#78877f]">Record money received this month. This updates actual activity, not your planned income.</p></div>
          {incomeFeedback && <span role="status" className="rounded-full bg-[#e1eee2] px-3 py-1.5 text-[12px] font-semibold text-[#4c7b66]" data-testid="status-quick-income">{incomeFeedback}</span>}
        </div>
        <form onSubmit={addIncome} className="grid gap-4 sm:grid-cols-[1.3fr_.8fr_1fr_auto] sm:items-end">
          <Field label="Where did it come from?" htmlFor="quick-income-description"><input id="quick-income-description" data-testid="input-quick-income-description" required value={incomeDescription} onChange={(event) => setIncomeDescription(event.target.value)} placeholder="e.g. freelance work" className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
          <Field label="Amount" htmlFor="quick-income-amount"><input id="quick-income-amount" data-testid="input-quick-income-amount" required type="number" min="0.01" step="0.01" value={incomeAmount} onChange={(event) => setIncomeAmount(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
          <Field label="Date" htmlFor="quick-income-date"><input id="quick-income-date" data-testid="input-quick-income-date" required type="date" min={`${budget.month}-01`} max={monthLastDay(budget.month)} value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
          <button type="submit" className="flex h-[45px] items-center justify-center gap-2 rounded-xl bg-[#dd977e] px-4 text-[13px] font-bold text-[#55382f] transition hover:-translate-y-0.5" data-testid="button-add-quick-income"><Plus size={16} /> Add income</button>
        </form>
      </section>

      <form onSubmit={addActualSpending} className="paper-card animate-rise delay-2 mt-5 rounded-[22px] p-5 sm:p-7" data-testid="form-overview-spending">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-[24px] text-[#25423b]">Add actual spending</h2>
            <p className="mt-1 text-[13px] text-[#78877f]">Log a purchase here and your category totals and money left over update right away.</p>
          </div>
          {spendFeedback && <div role="status" className="flex items-center gap-1.5 rounded-full bg-[#e1eee2] px-3 py-1.5 text-[12px] font-semibold text-[#4c7b66] animate-pop" data-testid="status-overview-spending"><Check size={14} />{spendFeedback}</div>}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr_.8fr_1fr_auto] sm:items-end">
          <Field label="What was it?" htmlFor="overview-spend-description">
            <div className="relative mt-2">
              <input
                id="overview-spend-description"
                data-testid="input-overview-spend-description"
                required
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSpendSuggestions}
                aria-controls={showSpendSuggestions ? 'overview-spend-suggestions' : undefined}
                aria-activedescendant={activeSpendSuggestion >= 0 && matchingSpendDescriptions[activeSpendSuggestion]
                  ? `overview-spend-suggestion-${activeSpendSuggestion}`
                  : undefined}
                value={spendDescription}
                onChange={(event) => {
                  setSpendDescription(event.target.value);
                  setSpendSuggestionsOpen(true);
                  setActiveSpendSuggestion(-1);
                }}
                onFocus={() => {
                  if (spendDescription.trim()) setSpendSuggestionsOpen(true);
                }}
                onBlur={() => setSpendSuggestionsOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && matchingSpendDescriptions.length > 0) {
                    event.preventDefault();
                    setSpendSuggestionsOpen(true);
                    setActiveSpendSuggestion((current) => Math.min(current + 1, matchingSpendDescriptions.length - 1));
                  } else if (event.key === 'ArrowUp' && matchingSpendDescriptions.length > 0) {
                    event.preventDefault();
                    setActiveSpendSuggestion((current) => Math.max(current - 1, 0));
                  } else if (
                    event.key === 'Enter' &&
                    showSpendSuggestions &&
                    activeSpendSuggestion >= 0 &&
                    matchingSpendDescriptions[activeSpendSuggestion]
                  ) {
                    event.preventDefault();
                    setSpendDescription(matchingSpendDescriptions[activeSpendSuggestion]);
                    setSpendSuggestionsOpen(false);
                    setActiveSpendSuggestion(-1);
                  } else if (event.key === 'Escape') {
                    setSpendSuggestionsOpen(false);
                    setActiveSpendSuggestion(-1);
                  }
                }}
                placeholder="e.g. groceries"
                className="input-field w-full rounded-xl px-3.5 py-3 text-[13px]"
              />
              {showSpendSuggestions && (
                <div
                  id="overview-spend-suggestions"
                  role="listbox"
                  aria-label="Past spending descriptions"
                  className="absolute inset-x-0 top-full z-30 mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#e5ded1] bg-[#fffdf8] p-1.5 shadow-[0_12px_28px_rgba(37,66,59,.16)]"
                  data-testid="list-overview-spend-suggestions"
                >
                  {matchingSpendDescriptions.map((description, index) => (
                    <button
                      key={description.toLocaleLowerCase()}
                      id={`overview-spend-suggestion-${index}`}
                      type="button"
                      role="option"
                      aria-selected={activeSpendSuggestion === index}
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSpendDescription(description);
                        setSpendSuggestionsOpen(false);
                        setActiveSpendSuggestion(-1);
                      }}
                      className={`block w-full rounded-lg px-3 py-2.5 text-left text-[13px] transition ${
                        activeSpendSuggestion === index ? 'bg-[#e8efe7] text-[#315b4e]' : 'text-[#365148] hover:bg-[#f3efe7]'
                      }`}
                      data-testid={`option-overview-spend-suggestion-${index}`}
                    >
                      {description}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="Category" htmlFor="overview-spend-category">
            <select id="overview-spend-category" data-testid="select-overview-spend-category" value={spendCategory} onChange={(event) => setSpendCategory(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]">
              {budget.categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="Amount" htmlFor="overview-spend-amount">
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b9c91]">$</span>
              <input id="overview-spend-amount" data-testid="input-overview-spend-amount" required min="0.01" step="0.01" type="number" value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} className="input-field w-full rounded-xl py-3 pl-8 pr-3 text-[13px]" />
            </div>
          </Field>
          <Field label="Date" htmlFor="overview-spend-date">
            <input id="overview-spend-date" data-testid="input-overview-spend-date" required min={`${budget.month}-01`} max={monthLastDay(budget.month)} type="date" value={spendDate} onChange={(event) => setSpendDate(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" />
          </Field>
          <button type="submit" className="flex h-[45px] items-center justify-center gap-2 rounded-xl bg-[#dd977e] px-4 text-[13px] font-bold text-[#55382f] transition hover:-translate-y-0.5 hover:bg-[#e2a087]" data-testid="button-add-overview-spending"><Plus size={17} /> Add spending</button>
        </div>
      </form>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="paper-card animate-rise delay-2 rounded-[22px] p-5 sm:p-7">
          <div className="mb-6 flex items-start justify-between">
            <div><h2 className="font-serif text-[24px] text-[#25423b]">How it’s feeling</h2><p className="mt-1 text-[13px] text-[#78877f]">Your spending, by plan.</p></div>
            <Link href="/budget" className="text-[12px] font-bold text-[#a76655] hover:underline" data-testid="link-edit-budget">Edit plan</Link>
          </div>
          <div className="space-y-5">
            {budget.categories.map((category) => {
              const Icon = iconMap[category.icon as IconName] ?? MoreHorizontal;
              const categorySpent = spentFor(category.name);
              const percent = category.planned ? Math.min(100, Math.round((categorySpent / category.planned) * 100)) : 0;
              const alertLevel = spendingAlerts && category.planned > 0 && categorySpent >= category.planned
                ? 'over'
                : spendingAlerts && category.planned > 0 && categorySpent >= category.planned * .8 ? 'near' : '';
              return (
                <div key={category.id} data-testid={`category-progress-${category.id}`}>
                  <div className="mb-2 flex items-center gap-3 text-[13px]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: `${category.color}25`, color: category.color }}><Icon size={16} /></div>
                    <span className="font-semibold text-[#365148]">{category.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-[#819088]">{money(categorySpent)} <span className="font-sans">of</span> {money(category.planned)}</span>
                  </div>
                  {alertLevel && <div role="status" className={`mb-2 text-[11px] font-semibold ${alertLevel === 'over' ? 'text-[#a75f4e]' : 'text-[#a66e42]'}`} data-testid={`status-spending-alert-${category.id}`}>{alertLevel === 'over' ? `Over plan by ${money(categorySpent - category.planned)}` : 'Getting close to this category’s plan'}</div>}
                  <div className="progress-track h-2 overflow-hidden rounded-full"><div className="progress-fill h-full rounded-full" style={{ width: `${Math.max(categorySpent ? 3 : 0, percent)}%`, backgroundColor: category.color }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="paper-card animate-rise delay-3 rounded-[22px] p-5 sm:p-7">
          <div className="mb-5 flex items-start justify-between"><div><h2 className="font-serif text-[24px] text-[#25423b]">Recent activity</h2><p className="mt-1 text-[13px] text-[#78877f]">The latest things you told me.</p></div><Link href="/transactions" className="text-[#315b4e]" data-testid="link-view-all-transactions"><ChevronRight size={19} /></Link></div>
          {monthTransactions.length === 0 ? <EmptyTransactions compact /> : (
            <div className="space-y-1">
              {monthTransactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} compact />)}
            </div>
          )}
        </div>
      </section>
      <section className="paper-card mt-5 rounded-[22px] p-5 sm:p-7" data-testid="section-spending-alerts">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div><h2 className="font-serif text-[22px] text-[#25423b]">Gentle spending alerts</h2><p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#78877f]">When enabled, categories with a positive plan are flagged at 80% and marked over plan above 100%. Zero-planned categories stay quiet.</p></div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-[#f3eee5] px-4 py-2 text-[13px] font-semibold text-[#365148]">
            <input type="checkbox" checked={spendingAlerts} onChange={(event) => setSpendingAlerts(event.target.checked)} aria-label="Enable spending alerts" data-testid="toggle-spending-alerts" className="h-4 w-4 accent-[#477666]" />
            {spendingAlerts ? 'Alerts on' : 'Alerts off'}
          </label>
        </div>
      </section>

      <section className="paper-card mt-5 rounded-[22px] p-5 sm:p-7" data-testid="section-savings-goals">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#a66e59]">For future you</div><h2 className="mt-1 font-serif text-[24px] text-[#25423b]">Savings goals</h2><p className="mt-1 text-[13px] text-[#78877f]">Progress follows your contributions across every saved month.</p></div>
          {goalFeedback && <span role="status" className="rounded-full bg-[#e1eee2] px-3 py-1.5 text-[12px] font-semibold text-[#4c7b66]" data-testid="status-goal-feedback">{goalFeedback}</span>}
        </div>
        <form onSubmit={createGoal} className="grid gap-3 rounded-2xl bg-[#f3eee5] p-4 sm:grid-cols-[1.2fr_.8fr_auto] sm:items-end">
          <Field label="Goal name" htmlFor="savings-goal-name"><input id="savings-goal-name" data-testid="input-savings-goal-name" required maxLength={60} value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="e.g. A weekend away" className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
          <Field label="Target amount" htmlFor="savings-goal-target"><input id="savings-goal-target" data-testid="input-savings-goal-target" required min="0.01" step="0.01" type="number" value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
          <button type="submit" className="flex h-[45px] items-center justify-center gap-2 rounded-xl bg-[#315b4e] px-4 text-[13px] font-bold text-[#f8f4e9] transition hover:-translate-y-0.5" data-testid="button-create-savings-goal"><Plus size={16} /> Create goal</button>
        </form>
        {goals.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-[#dcd5c8] px-4 py-7 text-center" data-testid="empty-savings-goals"><p className="font-serif text-[18px] text-[#365148]">Nothing set aside just yet</p><p className="mt-1 text-[12px] text-[#8c9992]">Create a goal above, then add contributions as you go.</p></div> : <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {goals.map((goal) => {
            const progress = transactions.filter((item) => item.goalId === goal.id && item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
            return <div key={goal.id} className="rounded-2xl border border-[#ede6da] p-4" data-testid={`card-savings-goal-${goal.id}`}>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-[19px] text-[#315247]">{goal.name}</h3><p className="mt-1 text-[12px] text-[#85938b]" data-testid={`text-goal-progress-${goal.id}`}>{moneyPrecise(progress)} saved of {moneyPrecise(goal.target)}</p></div><span className="rounded-full bg-[#e5efe5] px-2.5 py-1 text-[11px] font-semibold text-[#56806e]">{Math.min(100, Math.round(progress / goal.target * 100))}%</span></div>
              <div className="progress-track mt-3 h-2 overflow-hidden rounded-full"><div className="progress-fill h-full rounded-full bg-[#82aa72]" style={{ width: `${Math.min(100, progress / goal.target * 100)}%` }} /></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="sr-only" htmlFor={`goal-contribution-${goal.id}`}>Contribution amount for {goal.name}</label>
                <input id={`goal-contribution-${goal.id}`} data-testid={`input-goal-contribution-${goal.id}`} type="number" min="0.01" step="0.01" value={contributionAmounts[goal.id] ?? ''} onChange={(event) => setContributionAmounts((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder="Contribution amount" className="input-field min-w-0 rounded-xl px-3.5 py-2.5 text-[13px]" />
                <button type="button" onClick={() => contributeToGoal(goal)} disabled={!Number(contributionAmounts[goal.id]) || Number(contributionAmounts[goal.id]) <= 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e4eee1] px-3.5 py-2.5 text-[12px] font-bold text-[#477666] transition hover:bg-[#d8e8d7] disabled:cursor-not-allowed disabled:opacity-50" data-testid={`button-contribute-goal-${goal.id}`}><Plus size={15} /> Add contribution</button>
              </div>
            </div>;
          })}
        </div>}
      </section>
      <div className="animate-rise delay-4 mt-5 flex items-center gap-2 px-1 text-[12px] text-[#87958b]"><Sparkles size={14} className="text-[#d6987f]" /> Progress is information, not a judgment.</div>
    </div>
  );
}

function StartBudgetPage({ data }: { data: DataContext }) {
  const { budgets, hasStarted, startBudget: saveStartedBudget } = data;
  const [, setLocation] = useLocation();
  const [targetMonth, setTargetMonth] = useState(monthKey);
  const [income, setIncome] = useState(() => String(budgetForMonth(budgets, monthKey).income));
  const [plans, setPlans] = useState<Record<string, string>>(() =>
    Object.fromEntries(budgetForMonth(budgets, monthKey).categories.map((item) => [item.id, String(item.planned)])),
  );
  const [saved, setSaved] = useState(false);

  const monthBudget = budgetForMonth(budgets, targetMonth);
  const existingMonth = hasStarted && budgets.some((item) => item.month === targetMonth);
  const totalPlanned = monthBudget.categories.reduce((sum, item) => sum + Math.max(0, Number(plans[item.id]) || 0), 0);
  const remaining = (Number(income) || 0) - totalPlanned;
  const changeTargetMonth = (month: string) => {
    const template = budgetForMonth(budgets, month);
    setTargetMonth(month);
    setIncome(String(template.income));
    setPlans(Object.fromEntries(template.categories.map((item) => [item.id, String(item.planned)])));
    setSaved(false);
  };

  const startBudget = (event: FormEvent) => {
    event.preventDefault();
    const monthlyIncome = Number(income);
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return;

    saveStartedBudget({
      ...monthBudget,
      month: targetMonth,
      income: monthlyIncome,
      categories: monthBudget.categories.map((item) => ({
        ...item,
        planned: Math.max(0, Number(plans[item.id]) || 0),
      })),
    });
    setSaved(true);
    window.setTimeout(() => setLocation('/overview'), 700);
  };

  return (
    <div>
      <PageIntro
        eyebrow={existingMonth ? 'Monthly budget history' : 'A fresh place to begin'}
        title={existingMonth ? `Update ${monthLabel(targetMonth)}’s plan.` : 'Let’s give your money a plan.'}
      >
        <div className="flex items-center gap-2 text-[12px] text-[#83928a]"><CalendarDays size={15} /> {monthLabel(targetMonth)}</div>
      </PageIntro>

      <form onSubmit={startBudget} className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className="paper-card animate-rise rounded-[22px] p-6 sm:p-8">
          <div className="mb-6">
            <label className="text-[11px] font-bold uppercase tracking-[.15em] text-[#778a80]" htmlFor="start-budget-month">Budget month</label>
            <input
              id="start-budget-month"
              data-testid="input-start-budget-month"
              required
              type="month"
              value={targetMonth}
              onChange={(event) => changeTargetMonth(event.target.value)}
              className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-[#929990]">
              {existingMonth
                ? 'This month is already saved. Changes will update its plan.'
                : `A new month starts from ${monthLabel(monthBudget.month)}’s plan. You can change the income and category amounts below.`}
            </p>
          </div>
          <div className="mb-7">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e0eee1] text-[#477666]"><Banknote size={20} /></div>
            <h2 className="font-serif text-[26px] text-[#315247]">{existingMonth ? 'Update this month’s income' : 'Start with this month’s income'}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#809088]">Add the money you expect to bring home this month. You can adjust it whenever life changes.</p>
          </div>
          <label className="text-[11px] font-bold uppercase tracking-[.15em] text-[#778a80]" htmlFor="start-monthly-income">Monthly take-home income</label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-serif text-[21px] text-[#719080]">$</span>
            <input id="start-monthly-income" data-testid="input-start-monthly-income" type="number" min="0.01" step="0.01" required value={income} onChange={(event) => setIncome(event.target.value)} className="input-field w-full rounded-xl py-4 pl-9 pr-4 font-mono text-[22px]" />
          </div>
          <div className={`mt-6 rounded-2xl p-4 ${remaining < 0 ? 'bg-[#f6e7df]' : 'bg-[#f3eee5]'}`}>
            <div className="flex justify-between gap-3 text-[12px] text-[#7f8d85]">
              <span>{remaining < 0 ? 'More planned than income' : 'Still available to assign'}</span>
              <span className={`font-mono font-semibold ${remaining < 0 ? 'text-[#a75f4e]' : 'text-[#315247]'}`}>{money(Math.abs(remaining))}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4ded3]">
              <div className={`h-full rounded-full transition-all ${remaining < 0 ? 'bg-[#d78672]' : 'bg-[#7aa58c]'}`} style={{ width: `${Math.min(100, totalPlanned && Number(income) ? (totalPlanned / Number(income)) * 100 : 0)}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#929990]">It’s okay if you don’t assign every dollar yet.</p>
          </div>
        </section>

        <section className="paper-card animate-rise delay-1 rounded-[22px] p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="font-serif text-[26px] text-[#315247]">Choose what matters this month</h2>
            <p className="mt-2 text-[13px] text-[#809088]">Set a comfortable amount for each part of your life. These are easy to change later.</p>
          </div>
          <div className="space-y-3">
            {monthBudget.categories.map((category) => {
              const Icon = iconMap[category.icon as IconName] ?? MoreHorizontal;
              return (
                <div key={category.id} className="flex items-center gap-3 rounded-2xl border border-[#ede6da] p-3 transition hover:border-[#d9d5c6]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${category.color}25`, color: category.color }}><Icon size={18} /></div>
                  <label className="min-w-0 flex-1 text-[13px] font-semibold text-[#3b574d]" htmlFor={`start-plan-${category.id}`}>{category.name}</label>
                  <div className="relative w-[118px] shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-[#87998f]">$</span>
                    <input id={`start-plan-${category.id}`} aria-label={`Monthly amount for ${category.name}`} data-testid={`input-start-plan-${category.id}`} type="number" min="0" step="0.01" value={plans[category.id] ?? ''} onChange={(event) => setPlans((current) => ({ ...current, [category.id]: event.target.value }))} className="input-field w-full rounded-lg py-2.5 pl-7 pr-2 text-right font-mono text-[14px]" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-7 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <Link href="/" className="rounded-xl px-4 py-3 text-center text-sm font-semibold text-[#718078] transition hover:bg-[#f5f0e7]" data-testid="link-cancel-start-budget">Not right now</Link>
            <button type="submit" disabled={!Number(income) || Number(income) <= 0} className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${saved ? 'bg-[#7ba58b] text-white' : 'bg-[#315b4e] text-[#f8f4e9] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50'}`} data-testid="button-start-budget">
              {saved
                ? <><Check size={17} /> Budget saved</>
                : <><Check size={17} /> {existingMonth ? 'Save this month' : 'Start my budget'}</>}
            </button>
          </div>
        </section>
      </form>
      <div className="mt-5 flex items-center gap-2 px-1 text-[12px] text-[#89958d]"><Sparkles size={14} className="text-[#d6987f]" /> Each month keeps its own income and plan; transactions stay saved under their recorded month.</div>
    </div>
  );
}

function StatCard({ label, value, detail, icon, color, testId }: { label: string; value: string; detail: string; icon: ReactNode; color: 'sage' | 'peach'; testId: string }) {
  return <div className="paper-card flex min-h-[176px] animate-rise delay-2 flex-col justify-between rounded-[22px] p-6"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color === 'sage' ? 'bg-[#dcebe0] text-[#477666]' : 'bg-[#f5ded1] text-[#b86f59]'}`}>{icon}</div><div><div className="font-serif text-[32px] tracking-[-.03em] text-[#315247]" data-testid={testId}>{value}</div><div className="mt-1 flex items-center justify-between gap-2"><span className="text-[13px] font-semibold text-[#577066]">{label}</span><span className="text-[11px] text-[#94a099]">{detail}</span></div></div></div>;
}

function TransactionRow({ transaction, compact = false, onDelete }: { transaction: Transaction; compact?: boolean; onDelete?: () => void }) {
  const isIncome = transaction.type === 'income';
  const Icon = isIncome ? ArrowDownLeft : (iconMap[transaction.category === 'Income' ? 'other' : (seedBudget.categories.find((item) => item.name === transaction.category)?.icon as IconName)] ?? CreditCard);
  return (
    <div className={`group flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-[#f5f0e7] ${compact ? '' : 'border-b border-[#eee7dc]'}`} data-testid={`row-transaction-${transaction.id}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isIncome ? 'bg-[#dcebe0] text-[#427661]' : 'bg-[#f2e7dd] text-[#a66e59]'}`}><Icon size={16} /></div>
      <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-[#355148]">{transaction.description}</div><div className="mt-0.5 text-[11px] text-[#91a098]">{transaction.category} · {dateLabel(transaction.date)}</div></div>
      <div className={`font-mono text-[12px] font-semibold ${isIncome ? 'text-[#427661]' : 'text-[#536a61]'}`}>{isIncome ? '+' : '−'}{moneyPrecise(transaction.amount)}</div>
      {onDelete && <button onClick={onDelete} className="ml-1 rounded-lg p-1.5 text-[#b6b8ab] opacity-0 transition hover:bg-[#f2ddd5] hover:text-[#b2614f] group-hover:opacity-100" aria-label={`Delete ${transaction.description}`} data-testid={`button-delete-transaction-${transaction.id}`}><Trash2 size={15} /></button>}
    </div>
  );
}

function EmptyTransactions({ compact = false }: { compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'rounded-2xl border border-dashed border-[#dcd5c8] py-16'}`}><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#e5efe5] text-[#56806e]"><Receipt size={19} /></div><p className="font-serif text-[18px] text-[#365148]">A quiet start</p><p className="mt-1 max-w-[230px] text-[12px] leading-relaxed text-[#8c9992]">Add your first transaction when you’re ready.</p></div>;
}

function BudgetPage({ data }: { data: DataContext }) {
  const { budget, transactions, setBudget } = data;
  const [income, setIncome] = useState(String(budget.income));
  const [plans, setPlans] = useState<Record<string, string>>(() => Object.fromEntries(budget.categories.map((item) => [item.id, String(item.planned)])));
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setIncome(String(budget.income));
    setPlans(Object.fromEntries(budget.categories.map((item) => [item.id, String(item.planned)])));
  }, [budget]);
  const totalPlanned = budget.categories.reduce((sum, item) => sum + Number(plans[item.id] || 0), 0);
  const updatePlan = (id: string, value: string) => setPlans((current) => ({ ...current, [id]: value }));
  const save = () => {
    setBudget({ ...budget, income: Math.max(0, Number(income) || 0), categories: budget.categories.map((item) => ({ ...item, planned: Math.max(0, Number(plans[item.id]) || 0) })) });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };
  return <div>
    <PageIntro eyebrow="Your monthly plan" title="Make room for what matters.">
      <div className="flex items-center gap-3 text-[12px] text-[#83928a]"><CalendarDays size={15} /> {monthLabel(budget.month)}</div>
    </PageIntro>
    <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
      <section className="paper-card animate-rise rounded-[22px] p-6 sm:p-8">
        <div className="mb-7"><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e0eee1] text-[#477666]"><Banknote size={19} /></div><h2 className="font-serif text-[25px] text-[#315247]">Monthly income</h2><p className="mt-1 text-[13px] leading-relaxed text-[#809088]">Use the amount you can count on. You can always adjust it later.</p></div>
        <label className="text-[11px] font-bold uppercase tracking-[.15em] text-[#778a80]" htmlFor="monthly-income">Income to plan with</label>
        <div className="relative mt-2"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-serif text-[21px] text-[#719080]">$</span><input id="monthly-income" data-testid="input-monthly-income" type="number" min="0" value={income} onChange={(event) => setIncome(event.target.value)} className="input-field w-full rounded-xl py-4 pl-9 pr-4 font-mono text-[22px]" /></div>
        <div className="mt-8 rounded-2xl bg-[#f3eee5] p-4"><div className="flex justify-between text-[12px] text-[#7f8d85]"><span>Planned across categories</span><span className="font-mono font-semibold text-[#315247]">{money(totalPlanned)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4ded3]"><div className={`h-full rounded-full ${totalPlanned > Number(income) ? 'bg-[#d78672]' : 'bg-[#7aa58c]'}`} style={{ width: `${Math.min(100, Number(income) ? (totalPlanned / Number(income)) * 100 : 0)}%` }} /></div><div className="mt-2 text-[11px] text-[#9a9e94]">{totalPlanned > Number(income) ? `${money(totalPlanned - Number(income))} over income` : `${money(Number(income) - totalPlanned)} still unassigned`}</div></div>
      </section>
      <section className="paper-card animate-rise delay-1 rounded-[22px] p-6 sm:p-8">
        <div className="mb-6 flex items-start justify-between"><div><h2 className="font-serif text-[25px] text-[#315247]">Spending plan</h2><p className="mt-1 text-[13px] text-[#809088]">Give every category a gentle boundary.</p></div><div className="rounded-full bg-[#edf3eb] px-3 py-1.5 text-[11px] font-semibold text-[#5e806d]">{budget.categories.length} categories</div></div>
        <div className="space-y-3">
          {budget.categories.map((category) => {
            const Icon = iconMap[category.icon as IconName] ?? MoreHorizontal;
            return <div key={category.id} className="flex items-center gap-3 rounded-2xl border border-[#ede6da] p-3 transition hover:border-[#d9d5c6]"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${category.color}25`, color: category.color }}><Icon size={18} /></div><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-[#3b574d]">{category.name}</div><div className="mt-0.5 text-[11px] text-[#9aa39b]">{money(Number(plans[category.id] || 0))} planned</div></div><div className="relative w-[118px] shrink-0"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[13px] text-[#87998f]">$</span><input aria-label={`Plan for ${category.name}`} data-testid={`input-plan-${category.id}`} type="number" min="0" value={plans[category.id] ?? ''} onChange={(event) => updatePlan(category.id, event.target.value)} className="input-field w-full rounded-lg py-2.5 pl-7 pr-2 text-right font-mono text-[14px]" /></div></div>;
          })}
        </div>
        <div className="mt-7 flex justify-end"><button onClick={save} className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${saved ? 'bg-[#7ba58b] text-white' : 'bg-[#315b4e] text-[#f8f4e9] hover:-translate-y-0.5'}`} data-testid="button-save-budget">{saved ? <><Check size={17} /> Saved</> : <><Check size={17} /> Save changes</>}</button></div>
      </section>
    </div>
    <div className="mt-5 flex items-center gap-2 px-1 text-[12px] text-[#89958d]"><Sparkles size={14} className="text-[#d6987f]" /> Your plan can be imperfect and still be useful.</div>
  </div>;
}

function TransactionsPage({ data }: { data: DataContext }) {
  const { transactions, budget, budgets, setActiveMonth, addTransaction, removeTransaction, recurringTemplates, addRecurringTemplate, removeRecurringTemplate } = data;
  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(budget.categories[0]?.name ?? 'Other');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [feedback, setFeedback] = useState('');
  const [showForm, setShowForm] = useState(true);
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateType, setTemplateType] = useState<TransactionType>('expense');
  const [templateAmount, setTemplateAmount] = useState('');
  const [templateDay, setTemplateDay] = useState('1');
  const [templateCategory, setTemplateCategory] = useState(budget.categories[0]?.name ?? 'Other');
  const [templateFeedback, setTemplateFeedback] = useState('');
  const sorted = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date)), [transactions]);
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!description.trim() || Number(amount) <= 0) return;
    addTransaction({ id: `t-${Date.now()}`, type, description: description.trim(), category: type === 'income' ? 'Income' : category, amount: Number(amount), date });
    setDescription(''); setAmount(''); setFeedback(type === 'income' ? 'Income added' : 'Expense added');
    window.setTimeout(() => setFeedback(''), 2200);
  };
  const saveTemplate = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(templateAmount);
    const day = Number(templateDay);
    if (!templateDescription.trim() || !Number.isFinite(value) || value <= 0 || !Number.isInteger(day) || day < 1 || day > 31) return;
    addRecurringTemplate({
      id: `r-${Date.now()}`, description: templateDescription.trim(), type: templateType,
      amount: value, day, category: templateType === 'income' ? 'Income' : templateCategory,
    });
    setTemplateDescription('');
    setTemplateAmount('');
    setTemplateDay('1');
    setTemplateFeedback('Monthly template saved');
    window.setTimeout(() => setTemplateFeedback(''), 2200);
  };
  const applyTemplate = (template: RecurringTemplate) => {
    const duplicate = transactions.some((item) => item.recurringId === template.id && item.date.slice(0, 7) === budget.month);
    if (duplicate) return;
    const lastDay = Number(monthLastDay(budget.month).slice(-2));
    const date = `${budget.month}-${String(Math.min(template.day, lastDay)).padStart(2, '0')}`;
    const category = template.type === 'income'
      ? 'Income'
      : (budget.categories.some((item) => item.name === template.category) ? template.category : budget.categories[0]?.name ?? 'Other');
    addTransaction({
      id: `t-${Date.now()}`, type: template.type, description: template.description,
      category, amount: template.amount, date, recurringId: template.id,
    });
    setTemplateFeedback(`${template.description} added for ${monthLabel(budget.month)}`);
    window.setTimeout(() => setTemplateFeedback(''), 2400);
  };
  return <div>
    <PageIntro eyebrow="Your money story" title="Keep the picture current.">
      <button onClick={() => setShowForm((current) => !current)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#315b4e] px-4 py-3 text-sm font-semibold text-[#f8f4e9] shadow-[0_7px_18px_rgba(49,91,78,.15)] transition hover:-translate-y-0.5" data-testid="button-toggle-transaction-form">{showForm ? <X size={17} /> : <Plus size={17} />}{showForm ? 'Close form' : 'Add transaction'}</button>
    </PageIntro>
    <section className="paper-card mb-7 rounded-[22px] p-5 sm:p-7" data-testid="section-recurring-templates">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#a66e59]">Your monthly rhythm</div><h2 className="mt-1 font-serif text-[24px] text-[#25423b]">Recurring templates</h2><p className="mt-1 max-w-2xl text-[13px] text-[#78877f]">Templates never post automatically. Apply one to the selected month whenever you’re ready.</p></div>
        <label className="text-[11px] font-bold uppercase tracking-[.13em] text-[#778a80]" htmlFor="recurring-selected-month">Apply to month
          <select id="recurring-selected-month" data-testid="select-recurring-month" value={budget.month} onChange={(event) => setActiveMonth(event.target.value)} className="input-field mt-1 block rounded-xl px-3 py-2.5 text-[13px] font-semibold normal-case tracking-normal text-[#315b4e]">
            {[...budgets].sort((a, b) => b.month.localeCompare(a.month)).map((item) => <option key={item.month} value={item.month}>{monthLabel(item.month)}</option>)}
          </select>
        </label>
      </div>
      <form onSubmit={saveTemplate} className="grid gap-3 rounded-2xl bg-[#f3eee5] p-4 sm:grid-cols-2 lg:grid-cols-[1.25fr_.8fr_.8fr_.7fr_1fr_auto] lg:items-end">
        <Field label="Description" htmlFor="template-description"><input id="template-description" data-testid="input-template-description" required maxLength={80} value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="e.g. Paycheck" className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
        <Field label="Type" htmlFor="template-type"><select id="template-type" data-testid="select-template-type" value={templateType} onChange={(event) => setTemplateType(event.target.value as TransactionType)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]"><option value="expense">Expense</option><option value="income">Income</option></select></Field>
        <Field label="Amount" htmlFor="template-amount"><input id="template-amount" data-testid="input-template-amount" required type="number" min="0.01" step="0.01" value={templateAmount} onChange={(event) => setTemplateAmount(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
        <Field label="Day" htmlFor="template-day"><input id="template-day" data-testid="input-template-day" required type="number" min="1" max="31" value={templateDay} onChange={(event) => setTemplateDay(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
        {templateType === 'expense' ? <Field label="Category" htmlFor="template-category"><select id="template-category" data-testid="select-template-category" value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]">{budget.categories.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field> : <div className="hidden lg:block" />}
        <button type="submit" className="flex h-[45px] items-center justify-center gap-2 rounded-xl bg-[#315b4e] px-4 text-[13px] font-bold text-[#f8f4e9] transition hover:-translate-y-0.5" data-testid="button-save-recurring-template"><Plus size={16} /> Save template</button>
      </form>
      {templateFeedback && <div role="status" className="mt-3 text-[12px] font-semibold text-[#4c7b66]" data-testid="status-recurring-feedback">{templateFeedback}</div>}
      {recurringTemplates.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-[#dcd5c8] px-4 py-6 text-center text-[13px] text-[#8c9992]" data-testid="empty-recurring-templates">No templates yet. Save a regular income or expense to make month setup quicker.</div> : <div className="mt-4 divide-y divide-[#eee7dc]">
        {recurringTemplates.map((template) => {
          const applied = transactions.some((item) => item.recurringId === template.id && item.date.slice(0, 7) === budget.month);
          return <div key={template.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`row-recurring-template-${template.id}`}>
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${template.type === 'income' ? 'bg-[#dcebe0] text-[#427661]' : 'bg-[#f2e7dd] text-[#a66e59]'}`}>{template.type === 'income' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-[#355148]">{template.description}</div><div className="mt-0.5 text-[11px] text-[#91a098]">{template.type === 'income' ? 'Income' : template.category} · day {template.day} · {moneyPrecise(template.amount)}</div></div>
            <button type="button" disabled={applied} onClick={() => applyTemplate(template)} className="rounded-xl bg-[#e4eee1] px-3 py-2 text-[12px] font-bold text-[#477666] transition hover:bg-[#d8e8d7] disabled:cursor-not-allowed disabled:bg-[#f0eee8] disabled:text-[#929990]" data-testid={`button-apply-template-${template.id}`}>{applied ? 'Added this month' : `Add to ${monthLabel(budget.month)}`}</button>
            <button type="button" onClick={() => { if (window.confirm(`Delete the ${template.description} template? Existing transactions will stay in your history.`)) removeRecurringTemplate(template.id); }} className="rounded-lg p-2 text-[#a6aaa1] transition hover:bg-[#f2ddd5] hover:text-[#b2614f]" aria-label={`Delete ${template.description} template`} data-testid={`button-delete-template-${template.id}`}><Trash2 size={15} /></button>
          </div>;
        })}
      </div>}
    </section>
    {showForm && <form onSubmit={add} className="paper-card animate-pop mb-7 rounded-[22px] p-5 sm:p-7">
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-serif text-[24px] text-[#315247]">Add something new</h2><p className="mt-1 text-[13px] text-[#809088]">No need to remember everything. Just the things that help.</p></div>{feedback && <div className="flex items-center gap-1.5 rounded-full bg-[#e1eee2] px-3 py-1.5 text-[12px] font-semibold text-[#4c7b66] animate-pop"><Check size={14} />{feedback}</div>}</div>
      <div className="mb-5 flex rounded-xl bg-[#f1ede4] p-1 sm:w-fit">
        <button type="button" onClick={() => setType('expense')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold transition sm:flex-none ${type === 'expense' ? 'bg-[#f8f4eb] text-[#a5614f] shadow-sm' : 'text-[#8b958c]'}`} data-testid="button-type-expense"><ArrowUpRight size={15} /> Expense</button>
        <button type="button" onClick={() => setType('income')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold transition sm:flex-none ${type === 'income' ? 'bg-[#f8f4eb] text-[#4c7d66] shadow-sm' : 'text-[#8b958c]'}`} data-testid="button-type-income"><ArrowDownLeft size={15} /> Income</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
        <Field label="What was it?" htmlFor="transaction-description"><input id="transaction-description" data-testid="input-transaction-description" required value={description} onChange={(event) => setDescription(event.target.value)} placeholder={type === 'income' ? 'e.g. freelance work' : 'e.g. coffee with a friend'} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
        {type === 'expense' && <Field label="Category" htmlFor="transaction-category"><select id="transaction-category" data-testid="select-transaction-category" value={category} onChange={(event) => setCategory(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]">{budget.categories.map((item) => <option key={item.id}>{item.name}</option>)}</select></Field>}
        <Field label="Amount" htmlFor="transaction-amount"><div className="relative mt-2"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b9c91]">$</span><input id="transaction-amount" data-testid="input-transaction-amount" required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="input-field w-full rounded-xl py-3 pl-8 pr-3 text-[13px]" /></div></Field>
        <Field label="Date" htmlFor="transaction-date"><input id="transaction-date" data-testid="input-transaction-date" required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" /></Field>
        <button type="submit" className="flex h-[45px] items-center justify-center gap-2 rounded-xl bg-[#dd977e] px-4 text-[13px] font-bold text-[#55382f] transition hover:-translate-y-0.5 hover:bg-[#e2a087]" data-testid="button-add-transaction"><Plus size={17} /> Add</button>
      </div>
    </form>}
    <section className="paper-card animate-rise delay-1 rounded-[22px] p-5 sm:p-7">
       <div className="mb-5 flex items-end justify-between"><div><h2 className="font-serif text-[25px] text-[#315247]">Transaction history</h2><p className="mt-1 text-[13px] text-[#809088]">{transactions.length} {transactions.length === 1 ? 'entry' : 'entries'} across all months</p></div><div className="hidden items-center gap-1.5 text-[11px] text-[#96a098] sm:flex"><CreditCard size={14} /> Stored on this device</div></div>
      {sorted.length === 0 ? <EmptyTransactions /> : <div>{sorted.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={() => { if (window.confirm(`Remove ${transaction.description} from your history?`)) removeTransaction(transaction.id); }} />)}</div>}
    </section>
     <DataBackupPanel data={data} />
  </div>;
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DataBackupPanel({ data }: { data: DataContext }) {
  const {
    budgets, activeMonth, transactions, hasStarted, goals, recurringTemplates, spendingAlerts,
    replaceData, mergeData,
  } = data;
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [backupDraft, setBackupDraft] = useState<{ backup: BudgetBackup; fileName: string } | null>(null);
  const [backupError, setBackupError] = useState('');
  const [backupFeedback, setBackupFeedback] = useState('');

  const exportJson = () => {
    const backup: BudgetBackup = {
      app: 'budget-buddy',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { budgets, activeMonth, transactions, hasStarted, goals, recurringTemplates, spendingAlerts },
    };
    downloadTextFile(
      `budget-buddy-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      'application/json;charset=utf-8',
    );
    setBackupFeedback('Full backup downloaded.');
    setBackupError('');
  };

  const exportCsv = () => {
    const csvCell = (value: string | number) => {
      let text = String(value);
      if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['Date', 'Type', 'Description', 'Category', 'Amount (USD)'].map(csvCell).join(','),
      ...[...transactions]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => [
          csvCell(item.date),
          csvCell(item.type),
          csvCell(item.description),
          csvCell(item.category),
          csvCell(item.amount.toFixed(2)),
        ].join(',')),
    ];
    downloadTextFile(
      `budget-buddy-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      `\uFEFF${rows.join('\r\n')}`,
      'text/csv;charset=utf-8',
    );
    setBackupFeedback('Transaction CSV downloaded.');
    setBackupError('');
  };

  const chooseBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    setBackupDraft(null);
    setBackupError('');
    setBackupFeedback('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setBackupError('That file is larger than 10 MB. Choose a smaller Budget Buddy backup.');
      return;
    }
    try {
      const backup = parseBudgetBackup(await file.text());
      setBackupDraft({ backup, fileName: file.name });
      setRestoreMode('merge');
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'The backup could not be read. No data was changed.');
    }
  };

  const restoreBackup = () => {
    if (!backupDraft) return;
    if (restoreMode === 'replace') {
      const confirmed = window.confirm(
        'Replace all current budgets, transactions, goals, recurring templates, and alert settings with this backup? This cannot be undone from inside Budget Buddy.',
      );
      if (!confirmed) return;
      replaceData(backupDraft.backup.data);
      setBackupFeedback('Backup restored. Current app data was replaced.');
    } else {
      mergeData(backupDraft.backup.data);
      setBackupFeedback('Backup merged. Existing alert settings were kept.');
    }
    setBackupDraft(null);
    setBackupError('');
  };

  return (
    <section className="paper-card mt-5 rounded-[22px] p-5 sm:p-7" aria-labelledby="backup-panel-title" data-testid="section-data-backup">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5efe5] text-[#56806e]"><ShieldCheck size={19} /></div>
        <div>
          <h2 id="backup-panel-title" className="font-serif text-[24px] text-[#25423b]">Back up & move your data</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#78877f]">Your data currently stays in this browser. Download a full backup before clearing browser data or moving to another device.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-[#f3eee5] p-4">
          <h3 className="text-[13px] font-semibold text-[#365148]">Full app backup</h3>
          <p className="mt-1 min-h-10 text-[12px] leading-relaxed text-[#87958c]">Includes monthly budgets, transactions, savings goals, recurring templates, and alert settings.</p>
          <button type="button" onClick={exportJson} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#315b4e] px-3.5 py-2 text-[12px] font-bold text-[#f8f4e9] transition hover:-translate-y-0.5" data-testid="button-export-json-backup"><Download size={15} /> Download full backup</button>
        </div>
        <div className="rounded-2xl bg-[#f3eee5] p-4">
          <h3 className="text-[13px] font-semibold text-[#365148]">Transaction spreadsheet</h3>
          <p className="mt-1 min-h-10 text-[12px] leading-relaxed text-[#87958c]">Exports all income and expenses as a CSV you can open in a spreadsheet. This does not include your budget plans or goals.</p>
          <button type="button" onClick={exportCsv} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#cfc8b9] bg-[#fbf8f1] px-3.5 py-2 text-[12px] font-bold text-[#315b4e] transition hover:-translate-y-0.5" data-testid="button-export-transactions-csv"><Download size={15} /> Download transaction CSV</button>
        </div>
      </div>

      <div className="mt-5 border-t border-[#eee7dc] pt-5">
        <h3 className="font-serif text-[20px] text-[#315247]">Restore from a full backup</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[#87958c]">Choose a Budget Buddy JSON backup. It is checked before anything changes; CSV files can’t be restored here.</p>
        <label className="mt-4 block max-w-xl text-[11px] font-bold uppercase tracking-[.14em] text-[#778a80]" htmlFor="input-import-json-backup">
          Choose a JSON backup
          <input id="input-import-json-backup" data-testid="input-import-json-backup" type="file" accept=".json,application/json" onChange={chooseBackup} className="input-field mt-2 block w-full rounded-xl px-3 py-2.5 text-[13px] font-normal normal-case tracking-normal file:mr-3 file:rounded-lg file:border-0 file:bg-[#e4eee1] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[#477666]" />
        </label>

        {backupDraft && (
          <div className="mt-4 rounded-2xl border border-[#dce8da] bg-[#f6f8f1] p-4" data-testid="panel-backup-preview">
            <p className="text-[13px] font-semibold text-[#365148]">{backupDraft.fileName}</p>
            <p className="mt-1 text-[12px] text-[#78877f]">
              Exported {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backupDraft.backup.exportedAt))}
              {' · '}{backupDraft.backup.data.budgets.length} months
              {' · '}{backupDraft.backup.data.transactions.length} transactions
              {' · '}{backupDraft.backup.data.goals.length} goals
              {' · '}{backupDraft.backup.data.recurringTemplates.length} recurring templates
            </p>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-[11px] font-bold uppercase tracking-[.13em] text-[#778a80]">How should this backup be restored?</legend>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-white/70 p-3 text-[12px] text-[#365148]">
                <input id="radio-backup-merge" data-testid="radio-backup-merge" type="radio" name="backup-restore-mode" value="merge" checked={restoreMode === 'merge'} onChange={() => setRestoreMode('merge')} className="mt-0.5 accent-[#477666]" />
                <span><span className="font-semibold">Merge with current data</span><span className="mt-0.5 block leading-relaxed text-[#87958c]">Add new items and update matching months or IDs from the backup. Keep the current alert setting.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[#f8ece5] p-3 text-[12px] text-[#70483d]">
                <input id="radio-backup-replace" data-testid="radio-backup-replace" type="radio" name="backup-restore-mode" value="replace" checked={restoreMode === 'replace'} onChange={() => setRestoreMode('replace')} className="mt-0.5 accent-[#a66e59]" />
                <span><span className="font-semibold">Replace all current data</span><span className="mt-0.5 block leading-relaxed text-[#9b756a]">Replace budgets, transactions, goals, templates, and alert settings with the backup.</span></span>
              </label>
            </fieldset>
            <button type="button" onClick={restoreBackup} className={`mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold transition ${restoreMode === 'replace' ? 'bg-[#a75f4e] text-white hover:bg-[#934e40]' : 'bg-[#315b4e] text-[#f8f4e9] hover:bg-[#284d42]'}`} data-testid="button-restore-json-backup"><Upload size={15} /> {restoreMode === 'replace' ? 'Replace current data' : 'Merge backup'}</button>
          </div>
        )}

        {backupError && <p className="mt-3 rounded-xl bg-[#f8ece5] px-3.5 py-3 text-[12px] font-semibold text-[#9b5144]" role="alert" data-testid="status-backup-error">{backupError}</p>}
        {backupFeedback && <p className="mt-3 rounded-xl bg-[#e1eee2] px-3.5 py-3 text-[12px] font-semibold text-[#4c7b66]" role="status" data-testid="status-backup-feedback">{backupFeedback}</p>}
      </div>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label className="block min-w-0 text-[11px] font-bold uppercase tracking-[.14em] text-[#778a80]" htmlFor={htmlFor}>{label}{children}</label>;
}

export default App;