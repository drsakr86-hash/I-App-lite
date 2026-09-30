// Pure logic for ExpenseForm and RecurringExpenseForm
// (src/components/forms/ExpenseForm.jsx, RecurringExpenseForm.jsx). Every
// value and expression mirrors the legacy runtime's forms of the same name
// exactly (public/legacy/app-runtime.js); legacy quirks are kept on purpose.

// One-off expense. `today` is localISO(), `defaultCategory` is EXP_CATS[0][0].
export const blankExpense = (today, defaultCategory) => ({
  date: today,
  category: defaultCategory,
  amount: '',
  notes: '',
  clinic: ''
});

// Legacy quirk kept: edit mode uses `initial` as-is (no defaults merged in,
// unlike AptForm/VisitForm), so a stored expense missing a field just renders
// that field empty/unset.
export const initialExpenseState = (initial, today, defaultCategory) =>
  initial || blankExpense(today, defaultCategory);

// Recurring expense: same shape as a one-off expense, minus `date`.
// `defaultCategory` is EXP_CATS[0][0].
export const blankRecurringExpense = defaultCategory => ({
  category: defaultCategory,
  amount: '',
  notes: '',
  clinic: ''
});

export const initialRecurringExpenseState = (initial, defaultCategory) =>
  initial || blankRecurringExpense(defaultCategory);

// A positive numeric amount, shared by both forms.
const hasPositiveAmount = f => !!f.amount && Number(f.amount) > 0;

// ExpenseForm also requires a date; RecurringExpenseForm has no date field.
export const isValidExpense = f => hasPositiveAmount(f) && !!f.date;
export const isValidRecurringExpense = f => hasPositiveAmount(f);

// Save payload for either form: keeps the existing id in edit mode, assigns a
// new one (Date.now()) in add mode.
export const buildExpenseSavePayload = f => ({ ...f, id: f.id || Date.now() });
