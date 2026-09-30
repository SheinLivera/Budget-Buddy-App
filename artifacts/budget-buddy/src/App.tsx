import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
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
  HeartPulse,
  Home,
  Leaf,
  Menu,
  MoreHorizontal,
  PencilLine,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  TrendingUp,
  Utensils,
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
type Transaction = { id: string; type: TransactionType; description: string; category: string; amount: number; date: string };

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

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { budget: Budget; transactions: Transaction[]; hasStarted?: boolean };
      const samplePlan = [1240, 520, 220, 180, 260, 600];
      const isUntouchedSample =
        parsed.budget?.income === 4280 &&
        parsed.budget.categories.length === samplePlan.length &&
        parsed.budget.categories.every((category, index) =>
          category.id === seedBudget.categories[index]?.id && category.planned === samplePlan[index],
        ) &&
        parsed.transactions.length === previousSampleTransactions.length &&
        parsed.transactions.every((transaction, index) =>
          transaction.id === previousSampleTransactions[index]?.id &&
          transaction.type === previousSampleTransactions[index]?.type &&
          transaction.description === previousSampleTransactions[index]?.description &&
          transaction.category === previousSampleTransactions[index]?.category &&
          transaction.amount === previousSampleTransactions[index]?.amount &&
          transaction.date === `${parsed.budget.month}-${previousSampleTransactions[index]?.day}`,
        );
      if (isUntouchedSample) return { budget: seedBudget, transactions: seedTransactions, hasStarted: false };
      return {
        ...parsed,
        hasStarted: parsed.hasStarted ?? (
          parsed.budget.income > 0 ||
          parsed.budget.categories.some((category) => category.planned > 0) ||
          parsed.transactions.length > 0
        ),
      };
    }
  } catch {
    // localStorage can be unavailable in private browsing; the seeded state still works.
  }
  return { budget: seedBudget, transactions: seedTransactions, hasStarted: false };
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
  return {
    ...data,
    ready,
    setBudget: (budget: Budget) => setData((current) => ({ ...current, budget })),
    startBudget: (budget: Budget) => setData((current) => ({ ...current, budget, hasStarted: true })),
    addTransaction: (transaction: Transaction) => setData((current) => ({ ...current, transactions: [transaction, ...current.transactions] })),
    removeTransaction: (id: string) => setData((current) => ({ ...current, transactions: current.transactions.filter((item) => item.id !== id) })),
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
  const { budget, transactions, addTransaction } = data;
  const [spendDescription, setSpendDescription] = useState('');
  const [spendCategory, setSpendCategory] = useState(budget.categories[0]?.name ?? 'Other');
  const [spendAmount, setSpendAmount] = useState('');
  const [spendDate, setSpendDate] = useState(new Date().toISOString().slice(0, 10));
  const [spendFeedback, setSpendFeedback] = useState('');
  const expenses = useMemo(() => transactions.filter((item) => item.type === 'expense'), [transactions]);
  const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const planned = budget.categories.reduce((sum, item) => sum + item.planned, 0);
  const remaining = budget.income - spent;
  const percentSpent = budget.income ? Math.min(100, Math.round((spent / budget.income) * 100)) : 0;
  const spentFor = (category: string) => expenses.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0);
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
    setSpendAmount('');
    setSpendFeedback('Spending added to your overview');
    window.setTimeout(() => setSpendFeedback(''), 2200);
  };
  return (
    <div>
      <PageIntro eyebrow="Your monthly check-in" title="A clear view of your money.">
        <div className="flex flex-wrap items-center gap-3">
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
        <StatCard label="Income" value={money(budget.income)} detail="planned for this month" icon={<ArrowDownLeft size={18} />} color="sage" testId="text-income-total" />
        <StatCard label="Planned spending" value={money(planned)} detail={`${money(Math.max(0, budget.income - planned))} left unassigned`} icon={<CircleDollarSign size={18} />} color="peach" testId="text-planned-total" />
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
            <input id="overview-spend-description" data-testid="input-overview-spend-description" required value={spendDescription} onChange={(event) => setSpendDescription(event.target.value)} placeholder="e.g. groceries" className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" />
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
            <input id="overview-spend-date" data-testid="input-overview-spend-date" required type="date" value={spendDate} onChange={(event) => setSpendDate(event.target.value)} className="input-field mt-2 w-full rounded-xl px-3.5 py-3 text-[13px]" />
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
              return (
                <div key={category.id} data-testid={`category-progress-${category.id}`}>
                  <div className="mb-2 flex items-center gap-3 text-[13px]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: `${category.color}25`, color: category.color }}><Icon size={16} /></div>
                    <span className="font-semibold text-[#365148]">{category.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-[#819088]">{money(categorySpent)} <span className="font-sans">of</span> {money(category.planned)}</span>
                  </div>
                  <div className="progress-track h-2 overflow-hidden rounded-full"><div className="progress-fill h-full rounded-full" style={{ width: `${Math.max(categorySpent ? 3 : 0, percent)}%`, backgroundColor: category.color }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="paper-card animate-rise delay-3 rounded-[22px] p-5 sm:p-7">
          <div className="mb-5 flex items-start justify-between"><div><h2 className="font-serif text-[24px] text-[#25423b]">Recent activity</h2><p className="mt-1 text-[13px] text-[#78877f]">The latest things you told me.</p></div><Link href="/transactions" className="text-[#315b4e]" data-testid="link-view-all-transactions"><ChevronRight size={19} /></Link></div>
          {transactions.length === 0 ? <EmptyTransactions compact /> : (
            <div className="space-y-1">
              {transactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} compact />)}
            </div>
          )}
        </div>
      </section>
      <div className="animate-rise delay-4 mt-5 flex items-center gap-2 px-1 text-[12px] text-[#87958b]"><Sparkles size={14} className="text-[#d6987f]" /> Progress is information, not a judgment.</div>
    </div>
  );
}

function StartBudgetPage({ data }: { data: DataContext }) {
  const { budget, startBudget: saveStartedBudget } = data;
  const [, setLocation] = useLocation();
  const [income, setIncome] = useState('0');
  const [plans, setPlans] = useState<Record<string, string>>(() => Object.fromEntries(budget.categories.map((item) => [item.id, '0'])));
  const [saved, setSaved] = useState(false);

  const totalPlanned = budget.categories.reduce((sum, item) => sum + Math.max(0, Number(plans[item.id]) || 0), 0);
  const remaining = (Number(income) || 0) - totalPlanned;

  const startBudget = (event: FormEvent) => {
    event.preventDefault();
    const monthlyIncome = Number(income);
    if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return;

    saveStartedBudget({
      ...budget,
      income: monthlyIncome,
      categories: budget.categories.map((item) => ({
        ...item,
        planned: Math.max(0, Number(plans[item.id]) || 0),
      })),
    });
    setSaved(true);
    window.setTimeout(() => setLocation('/overview'), 700);
  };

  return (
    <div>
      <PageIntro eyebrow="A fresh place to begin" title="Let’s give your money a plan.">
        <div className="flex items-center gap-2 text-[12px] text-[#83928a]"><CalendarDays size={15} /> {monthLabel(budget.month)}</div>
      </PageIntro>

      <form onSubmit={startBudget} className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className="paper-card animate-rise rounded-[22px] p-6 sm:p-8">
          <div className="mb-7">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e0eee1] text-[#477666]"><Banknote size={20} /></div>
            <h2 className="font-serif text-[26px] text-[#315247]">Start with your income</h2>
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
            {budget.categories.map((category) => {
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
              {saved ? <><Check size={17} /> Budget started</> : <><Check size={17} /> Start my budget</>}
            </button>
          </div>
        </section>
      </form>
      <div className="mt-5 flex items-center gap-2 px-1 text-[12px] text-[#89958d]"><Sparkles size={14} className="text-[#d6987f]" /> Your current transactions stay in your history when you start this plan.</div>
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
  const { transactions, budget, addTransaction, removeTransaction } = data;
  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(budget.categories[0]?.name ?? 'Other');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [feedback, setFeedback] = useState('');
  const [showForm, setShowForm] = useState(true);
  const sorted = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date)), [transactions]);
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!description.trim() || Number(amount) <= 0) return;
    addTransaction({ id: `t-${Date.now()}`, type, description: description.trim(), category: type === 'income' ? 'Income' : category, amount: Number(amount), date });
    setDescription(''); setAmount(''); setFeedback(type === 'income' ? 'Income added' : 'Expense added');
    window.setTimeout(() => setFeedback(''), 2200);
  };
  return <div>
    <PageIntro eyebrow="Your money story" title="Keep the picture current.">
      <button onClick={() => setShowForm((current) => !current)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#315b4e] px-4 py-3 text-sm font-semibold text-[#f8f4e9] shadow-[0_7px_18px_rgba(49,91,78,.15)] transition hover:-translate-y-0.5" data-testid="button-toggle-transaction-form">{showForm ? <X size={17} /> : <Plus size={17} />}{showForm ? 'Close form' : 'Add transaction'}</button>
    </PageIntro>
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
      <div className="mb-5 flex items-end justify-between"><div><h2 className="font-serif text-[25px] text-[#315247]">Transaction history</h2><p className="mt-1 text-[13px] text-[#809088]">{transactions.length} {transactions.length === 1 ? 'entry' : 'entries'} this month</p></div><div className="hidden items-center gap-1.5 text-[11px] text-[#96a098] sm:flex"><CreditCard size={14} /> Stored on this device</div></div>
      {sorted.length === 0 ? <EmptyTransactions /> : <div>{sorted.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={() => { if (window.confirm(`Remove ${transaction.description} from your history?`)) removeTransaction(transaction.id); }} />)}</div>}
    </section>
  </div>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label className="block min-w-0 text-[11px] font-bold uppercase tracking-[.14em] text-[#778a80]" htmlFor={htmlFor}>{label}{children}</label>;
}

export default App;