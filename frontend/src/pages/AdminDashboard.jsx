import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "../components/AppHeader.jsx";
import { apiDownload, apiRequest } from "../api/client.js";
import { getDefaultMealDate } from "../utils/mealDate.js";
import StudentAccessSection from "./StudentAccessSection.jsx";
import { Html5Qrcode } from "html5-qrcode";

const mealNames = ["breakfast", "lunch", "teaTime", "dinner"];
const mealTypes = ["veg", "nonVeg"];
const ingredientUnits = new Set(["g", "kg", "ml", "L", "piece"]);
const sections = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["student-access", "Manage Student Access"],
  ["meals", "Meal Choices"],
  ["preparation", "Food Preparation & Waste"],
  ["feedback", "Feedback & Ratings"],
  ["inventory", "Inventory Management"],
  ["attendance", "Dining Attendance"],
  ["scanner", "Dining Attendance Scanner"],
  ["reports", "Analytics & Reports"],
  ["exports", "Export Reports"],
  ["menu", "Daily Menu"],
  ["special-menu", "Special Menu Management"],
  ["notifications", "Email & Alerts"],
];
function emptyMenu() {
  return {
    isHoliday: false,
    ...Object.fromEntries(mealNames.map((name) => [
      name,
      { veg: "", nonVeg: "", ingredients: { veg: "", nonVeg: "" } },
    ])),
  };
}

function emptySpecialMenu(date) {
  return {
    occasionName: "",
    date,
    description: "",
    isPublished: true,
    meals: Object.fromEntries(mealNames.map((meal) => [meal, { enabled: false, veg: "", nonVeg: "" }])),
  };
}

function specialMenuToForm(specialMenu) {
  return {
    occasionName: specialMenu.occasionName,
    date: specialMenu.date,
    description: specialMenu.description || "",
    isPublished: specialMenu.isPublished,
    meals: Object.fromEntries(mealNames.map((meal) => [meal, {
      enabled: Boolean(specialMenu[meal]),
      veg: (specialMenu[meal]?.veg || []).join("\n"),
      nonVeg: (specialMenu[meal]?.nonVeg || []).join("\n"),
    }])),
  };
}

function menuToForm(menu) {
  return {
    isHoliday: Boolean(menu?.isHoliday),
    ...Object.fromEntries(mealNames.map((name) => [
      name,
      {
        veg: (menu?.[name]?.veg || []).join("\n"),
        nonVeg: (menu?.[name]?.nonVeg || []).join("\n"),
        ingredients: Object.fromEntries(mealTypes.map((type) => [
          type,
          (menu?.[name]?.ingredients?.[type] || [])
            .map(({ name: ingredient, quantityPerServing, unit }) =>
              `${ingredient} | ${quantityPerServing} | ${unit}`
            )
            .join("\n"),
        ])),
      },
    ])),
  };
}

function lines(value) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function parseIngredientLines(value, label) {
  const ingredients = lines(value).map((line, index) => {
    const [name, quantity, unit, ...extra] = line.split("|").map((part) => part.trim());
    const quantityPerServing = Number(quantity);
    if (
      extra.length ||
      !name ||
      name.length > 80 ||
      !Number.isFinite(quantityPerServing) ||
      quantityPerServing <= 0 ||
      quantityPerServing > 1000000 ||
      !ingredientUnits.has(unit)
    ) {
      throw new Error(`${label}, line ${index + 1}: enter ingredient name | positive quantity | unit (g, kg, ml, L, or piece).`);
    }
    return { name, quantityPerServing, unit };
  });
  const uniqueKeys = new Set(ingredients.map(({ name, unit }) => `${name.toLowerCase()}|${unit}`));
  if (uniqueKeys.size !== ingredients.length) {
    throw new Error(`${label}: each ingredient and unit combination can be listed only once.`);
  }
  return ingredients;
}

function formatQuantity(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

function mealLabel(name) {
  return name === "teaTime"
    ? "Tea Time"
    : name[0].toUpperCase() + name.slice(1);
}

function currentIstDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function studentMealChoice(choice) {
  if (choice?.status === "eat") {
    if (choice.mealType === "nonVeg") return "NON-VEG";
    if (choice.mealType === "veg") return "VEG";
    return "INCOMPLETE";
  }
  return choice?.status === "skip" ? "SKIP" : "NOT SELECTED";
}

export default function AdminDashboard() {
  const [section, setSection] = useState("overview");
  const [date, setDate] = useState(getDefaultMealDate);
  const [buffer, setBuffer] = useState(0);
  const [statistics, setStatistics] = useState(null);
  const [quantities, setQuantities] = useState(null);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userRole, setUserRole] = useState("all");
  const [userStatus, setUserStatus] = useState("all");
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [mealName, setMealName] = useState("breakfast");
  const [mealStatus, setMealStatus] = useState("");
  const [mealType, setMealType] = useState("");
  const [mealRows, setMealRows] = useState([]);
  const [foodPreparation, setFoodPreparation] = useState({ records: [], totalsByUnit: [] });
  const [menuForm, setMenuForm] = useState(emptyMenu);
  const [menuExists, setMenuExists] = useState(false);
  const [specialMenus, setSpecialMenus] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notice, setNotice] = useState({ text: "", error: false });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const mealQuery = new URLSearchParams({ date, meal: mealName });
      if (mealStatus) mealQuery.set("status", mealStatus);
      if (mealType) mealQuery.set("mealType", mealType);
      const userQuery = new URLSearchParams({
        search: userSearch,
        role: userRole,
        status: userStatus,
        page: String(userPage),
        limit: "25",
      });
      const [stats, food, userResult, mealResult, preparationResult, menuResult, notificationResult] = await Promise.all([
        apiRequest(`/admin/statistics?date=${encodeURIComponent(date)}`),
        apiRequest(`/admin/food-quantity?date=${encodeURIComponent(date)}&bufferPercent=${buffer}`),
        apiRequest(`/admin/users?${userQuery}`),
        apiRequest(`/admin/meals?${mealQuery}`),
        apiRequest(`/admin/food-preparation?date=${encodeURIComponent(date)}`),
        apiRequest(`/admin/menu?date=${encodeURIComponent(date)}`),
        apiRequest("/admin/notifications"),
      ]);
      setStatistics(stats);
      setQuantities(food);
      setUsers(userResult.users);
      setUserPages(Math.max(userResult.pages, 1));
      setMealRows(mealResult.meals);
      setFoodPreparation(preparationResult);
      setMenuExists(Boolean(menuResult.menu));
      setMenuForm(menuToForm(menuResult.menu));
      setSpecialMenus(menuResult.menu?.specialMenus || []);
      setNotifications(notificationResult.notifications);
      setNotice({ text: "", error: false });
    } catch (error) {
      setNotice({ text: error.message, error: true });
    } finally {
      setLoading(false);
    }
  }, [buffer, date, mealName, mealStatus, mealType, userPage, userRole, userSearch, userStatus]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 220);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const totals = useMemo(() => statistics?.totals || {}, [statistics]);

  async function setUserActive(user, isActive) {
    try {
      await apiRequest(`/admin/users/${user._id}/status`, {
        method: "PATCH",
        body: { isActive },
      });
      setNotice({ text: `${user.name}'s account is now ${isActive ? "active" : "inactive"}.`, error: false });
      await loadData();
    } catch (error) {
      setNotice({ text: error.message, error: true });
    }
  }

  async function saveMenu(event) {
    event.preventDefault();
    try {
      const payload = {
        date,
        isHoliday: menuForm.isHoliday,
        ...Object.fromEntries(mealNames.map((name) => [
          name,
          {
            veg: lines(menuForm[name].veg),
            nonVeg: lines(menuForm[name].nonVeg),
            ingredients: {
              veg: parseIngredientLines(menuForm[name].ingredients.veg, `${mealLabel(name)} vegetarian ingredients`),
              nonVeg: parseIngredientLines(menuForm[name].ingredients.nonVeg, `${mealLabel(name)} non-vegetarian ingredients`),
            },
          },
        ])),
      };
      await apiRequest("/admin/menu", { method: "PUT", body: payload });
      setMenuExists(true);
      await loadData();
      setNotice({ text: `Menu saved for ${date}.`, error: false });
    } catch (error) {
      setNotice({ text: error.message, error: true });
    }
  }

  async function saveFoodPreparation(payload) {
    try {
      await apiRequest("/admin/food-preparation", { method: "PUT", body: payload });
      await loadData();
      setNotice({ text: "Food preparation record saved.", error: false });
      return true;
    } catch (error) {
      setNotice({ text: error.message, error: true });
      return false;
    }
  }

  function updateMenuField(meal, type, value) {
    setMenuForm((previous) => ({
      ...previous,
      [meal]: { ...previous[meal], [type]: value },
    }));
  }

  function updateIngredientField(meal, type, value) {
    setMenuForm((previous) => ({
      ...previous,
      [meal]: {
        ...previous[meal],
        ingredients: { ...previous[meal].ingredients, [type]: value },
      },
    }));
  }

  return (
    <div className="app-page">
      <AppHeader />
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <p className="eyebrow">MESS CONTROL</p>
          <nav aria-label="Admin sections">
            {sections.map(([key, label]) => (
              <button
                className={`sidebar-link${section === key ? " active" : ""}`}
                key={key}
                type="button"
                onClick={() => setSection(key)}
              >
                <span className="sidebar-mark" aria-hidden="true">{key === "overview" ? "◫" : key === "users" ? "♙" : key === "meals" ? "☷" : "✳"}</span>
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-note"><span>MessMate</span><p>Plan thoughtfully.<br />Serve confidently.</p></div>
        </aside>
        <main className="admin-main">
          <div className="admin-title-row">
            <div><p className="eyebrow">ADMIN DASHBOARD</p><h1>{sections.find(([key]) => key === section)?.[1]}</h1></div>
            <label className="date-control">Planning date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setUserPage(1); }} /></label>
          </div>
          {notice.text && <div className={`notice${notice.error ? " notice-error" : " notice-success"}`} role="status">{notice.text}</div>}
          {loading && <div className="loading-line" role="status">Refreshing live dining data…</div>}
          {section === "overview" && (
            <Overview date={date} statistics={statistics} quantities={quantities} totalMeals={totals} buffer={buffer} setBuffer={setBuffer} />
          )}
          {section === "users" && (
            <UsersSection
              users={users} search={userSearch} setSearch={(value) => { setUserSearch(value); setUserPage(1); }}
              role={userRole} setRole={(value) => { setUserRole(value); setUserPage(1); }}
              status={userStatus} setStatus={(value) => { setUserStatus(value); setUserPage(1); }}
              page={userPage} pages={userPages} setPage={setUserPage} onSetActive={setUserActive}
            />
          )}
          {section === "meals" && (
            <MealsSection mealName={mealName} setMealName={setMealName} status={mealStatus} setStatus={setMealStatus} type={mealType} setType={setMealType} rows={mealRows} />
          )}
          {section === "preparation" && (
            <FoodPreparationSection
              date={date}
              data={foodPreparation}
              onSave={saveFoodPreparation}
              onMessage={setNotice}
            />
          )}
          {section === "feedback" && <AdminFeedbackSection onMessage={setNotice} />}
          {section === "inventory" && <InventorySection onMessage={setNotice} />}
          {section === "attendance" && <AttendanceSection date={date} onMessage={setNotice} />}
          {section === "scanner" && <DiningAttendanceScanner onMessage={setNotice} />}
          {section === "student-access" && <StudentAccessSection onMessage={setNotice} />}
          {section === "reports" && <ReportsSection date={date} onMessage={setNotice} />}
          {section === "exports" && <ExportReportsSection date={date} onMessage={setNotice} />}
          {section === "menu" && (
            <MenuSection menuForm={menuForm} onChange={updateMenuField} onIngredientChange={updateIngredientField} onHolidayChange={(isHoliday) => setMenuForm((previous) => ({ ...previous, isHoliday }))} onSubmit={saveMenu} exists={menuExists} date={date} />
          )}
          {section === "special-menu" && <SpecialMenuManagement date={date} specialMenus={specialMenus} onDateChange={setDate} onMessage={setNotice} onChanged={loadData} />}
          {section === "notifications" && (
            <EmailSection notifications={notifications} onSent={loadData} onMessage={setNotice} />
          )}
        </main>
      </div>
    </div>
  );
}

function Overview({ date, statistics, quantities, totalMeals, buffer, setBuffer }) {
  const categorizedServings = (totalMeals.veg || 0) + (totalMeals.nonVeg || 0);
  const cards = [
    ["Eligible students", statistics?.totalStudents ?? "—", "active student accounts"],
    ["EAT selections", totalMeals.eat ?? "—", "meal selections across the day"],
    ["SKIP selections", totalMeals.skip ?? "—", "meal selections across the day"],
    ["Not selected", totalMeals.notSelected ?? "—", "meal selections across the day"],
    ["Confirmed servings", categorizedServings, "VEG + NON-VEG selections"],
    ["VEG servings", totalMeals.veg ?? "—", "confirmed categorized demand"],
    ["NON-VEG servings", totalMeals.nonVeg ?? "—", "confirmed categorized demand"],
    ["Incomplete EAT", totalMeals.incomplete ?? "—", "excluded from categorized demand"],
  ];

  return (
    <section className="admin-section">
      <div className="panel-heading demand-heading">
        <div><p className="eyebrow">SELECTED-DATE DEMAND</p><h2>Meal preference totals</h2><p>Counts below combine Breakfast, Lunch, Tea Time, and Dinner. They count meal selections, not unique students; each student may select multiple meals.</p></div>
        <strong className="demand-date">Meal date: {date}</strong>
      </div>
      <div className="summary-grid">
        {cards.map(([label, value, caption]) => <article className="summary-card" key={label}><span>{label}</span><strong>{value}</strong><small>{caption}</small></article>)}
      </div>
      <div className="panel quantity-panel">
        <div className="panel-heading"><div><p className="eyebrow">KITCHEN PREPARATION</p><h2>Recommended food quantity</h2><p>Confirmed servings and the optional preparation buffer are shown separately. Only confirmed “eat” choices count; skipped and unselected meals are excluded.</p></div>
          <label className="buffer-control">Safety buffer<input type="number" min="0" max="100" value={buffer} onChange={(event) => setBuffer(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /><span>%</span></label>
        </div>
        <div className="quantity-grid">
          {mealNames.map((name) => {
            const meal = quantities?.meals?.[name];
            const max = Math.max(meal?.confirmedTotal || 0, 1);
            return <article className="quantity-card" key={name}>
              <div className="quantity-title"><h3>{mealLabel(name)}</h3><span>{meal?.categorizedConfirmedTotal ?? "—"} confirmed servings</span></div>
              <QuantityRow label="Veg" confirmed={meal?.confirmedVeg} extra={meal?.bufferVeg} planned={meal?.recommendedVeg} max={max} type="veg" />
              <QuantityRow label="Non-veg" confirmed={meal?.confirmedNonVeg} extra={meal?.bufferNonVeg} planned={meal?.recommendedNonVeg} max={max} type="nonVeg" />
              <IngredientEstimates estimate={meal} />
              <div className="quantity-foot"><span>EAT {meal?.confirmedTotal ?? "—"} · SKIP {meal?.skipped ?? "—"} · Not selected {meal?.notSelected ?? "—"} · Incomplete EAT {meal?.incomplete ?? "—"}</span><strong>Total recommended {meal?.recommendedTotal ?? "—"} servings</strong></div>
            </article>;
          })}
        </div>
      </div>
      <div className="panel report-panel">
        <div className="panel-heading"><div><p className="eyebrow">DAILY REPORT</p><h2>Meal response at a glance</h2></div></div>
        <div className="report-table-wrap"><table><thead><tr><th>Meal</th><th>Eat</th><th>Skip</th><th>Not selected</th><th>Veg</th><th>Non-veg</th><th>Incomplete EAT</th></tr></thead><tbody>
          {mealNames.map((name) => { const item = statistics?.meals?.[name]; return <tr key={name}><th>{mealLabel(name)}</th><td>{item?.eat ?? "—"}</td><td>{item?.skip ?? "—"}</td><td>{item?.notSelected ?? "—"}</td><td>{item?.veg ?? "—"}</td><td>{item?.nonVeg ?? "—"}</td><td>{item?.incomplete ?? "—"}</td></tr>; })}
        </tbody></table></div>
      </div>
    </section>
  );
}

function QuantityRow({ label, confirmed, extra, planned, max, type }) {
  return <div className="quantity-row"><div className="quantity-row-top"><span><i className={`diet-dot ${type}`} />{label}</span><strong>{planned ?? "—"} planned servings</strong></div><div className="quantity-track"><span className={`quantity-fill ${type}`} style={{ width: `${Math.min(((confirmed || 0) / max) * 100, 100)}%` }} /></div><small>Confirmed servings: {confirmed ?? "—"} · Additional buffer: {extra === undefined ? "—" : `+${extra}`}</small></div>;
}

function FoodPreparationSection({ date, data, onSave, onMessage }) {
  const [saving, setSaving] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(date);
  const [rangeTo, setRangeTo] = useState(date);
  const [displayData, setDisplayData] = useState(data);
  const [loadingRange, setLoadingRange] = useState(false);

  useEffect(() => {
    setRangeFrom(date);
    setRangeTo(date);
    setDisplayData(data);
  }, [date, data]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    try {
      const saved = await onSave({
        date,
        meal: values.get("meal"),
        foodItem: values.get("foodItem"),
        quantityPrepared: Number(values.get("quantityPrepared")),
        quantityServed: Number(values.get("quantityServed")),
        quantityDiscarded: Number(values.get("quantityDiscarded") || 0),
        unit: values.get("unit"),
        reason: values.get("reason"),
        notes: values.get("notes"),
      });
      if (saved) form.reset();
    } finally {
      setSaving(false);
    }
  }

  async function loadRange(event) {
    event.preventDefault();
    setLoadingRange(true);
    try {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const result = await apiRequest(`/admin/food-preparation?${params}`);
      setDisplayData(result);
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setLoadingRange(false);
    }
  }

  return (
    <section className="panel admin-section">
      <SmartFoodDemand date={date} onMessage={onMessage} />
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ACTUAL KITCHEN DATA</p>
          <h2>Food Preparation Summary</h2>
          <p>Record actual amounts prepared, served, and discarded. Unserved food remains distinct from recorded waste.</p>
        </div>
        <strong className="demand-date">Meal date: {date}</strong>
      </div>
      <form className="preparation-form" onSubmit={submit}>
        <label>Meal
          <select name="meal" required defaultValue="breakfast">
            {mealNames.map((meal) => <option key={meal} value={meal}>{mealLabel(meal)}</option>)}
          </select>
        </label>
        <label>Food item
          <input name="foodItem" maxLength="80" required />
        </label>
        <label>Prepared quantity
          <input name="quantityPrepared" type="number" min="0" step="any" required />
        </label>
        <label>Served quantity
          <input name="quantityServed" type="number" min="0" step="any" required />
        </label>
        <label>Unit
          <select name="unit" required defaultValue="portion">
            {["portion", "piece", "g", "kg", "ml", "L"].map((unit) => <option key={unit}>{unit}</option>)}
          </select>
        </label>
        <label>Discarded quantity
          <input name="quantityDiscarded" type="number" min="0" step="any" defaultValue="0" required />
        </label>
        <label>Reason for waste (optional)
          <input name="reason" maxLength="300" />
        </label>
        <label className="preparation-notes">Notes (optional)
          <textarea name="notes" rows="3" maxLength="2000" />
        </label>
        <div className="preparation-submit">
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save actual quantities"}
          </button>
        </div>
      </form>
      <p className="food-safety-note">Record only verified discarded quantities; unaccounted surplus remains distinct from recorded discard.</p>
      <form className="preparation-range" onSubmit={loadRange}>
        <label>From<input type="date" required value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} /></label>
        <label>To<input type="date" required value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} /></label>
        <button className="button button-secondary" type="submit" disabled={loadingRange}>
          {loadingRange ? "Loading…" : "View preparation & waste"}
        </button>
      </form>
      <div className="waste-summary-grid">
        {(displayData.totalsByUnit || []).map((total) => (
          <article className="summary-card" key={total.unit}>
            <span>Totals ({total.unit})</span>
            <strong>{formatQuantity(total.quantityRemaining)} unserved</strong>
            <small>Prepared {formatQuantity(total.quantityPrepared)} · Served {formatQuantity(total.quantityServed)} · Discarded {formatQuantity(total.quantityDiscarded)} ({formatQuantity(total.discardedPercentage)}%)</small>
          </article>
        ))}
        {!displayData.totalsByUnit?.length && <p className="empty-notifications">No preparation records for this date range yet.</p>}
      </div>
      <PreparationAnalytics data={displayData} />
      <div className="report-table-wrap">
        <table>
          <thead><tr><th>Meal</th><th>Food item</th><th>Prepared</th><th>Served</th><th>Unserved</th><th>Discarded</th><th>Unaccounted</th><th>Reason</th><th>Notes</th></tr></thead>
          <tbody>
            {(displayData.records || []).map((record) => (
              <tr key={record._id}>
                <th>{mealLabel(record.meal)}</th>
                <td>{record.foodItem}</td>
                <td>{formatQuantity(record.quantityPrepared)} {record.unit}</td>
                <td>{formatQuantity(record.quantityServed)} {record.unit}</td>
                <td>{formatQuantity(record.quantityRemaining)} {record.unit}</td>
                <td>{formatQuantity(record.quantityDiscarded || 0)} {record.unit}</td>
                <td>{formatQuantity(record.quantityUnaccounted)} {record.unit}</td>
                <td>{record.reason || "—"}</td>
                <td>{record.notes || "—"}</td>
              </tr>
            ))}
            {!displayData.records?.length && <tr><td className="empty-row" colSpan="9">No actual preparation quantities recorded for this date range.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SmartFoodDemand({ date, onMessage }) {
  const [selectedDate, setSelectedDate] = useState(date);
  const [meal, setMeal] = useState("breakfast");
  const [forecast, setForecast] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => setSelectedDate(date), [date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const end = new Date(`${selectedDate}T00:00:00.000Z`);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      const from = start.toISOString().slice(0, 10);
      const current = await apiRequest(`/admin/food-demand/predict?date=${encodeURIComponent(selectedDate)}`, { method: "POST", body: {} });
      const historical = await apiRequest(`/admin/food-demand?from=${from}&to=${selectedDate}&meal=${meal}`);
      setForecast(current.meals.find((item) => item.meal === meal) || null);
      setHistory(historical.predictions || []);
    } catch (error) {
      onMessage({ text: error.message, error: true });
      setForecast(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [meal, onMessage, selectedDate]);

  useEffect(() => { load(); }, [load]);

  const maxAttendance = Math.max(1, ...history.flatMap((item) => [item.predictedAttendance || 0, item.actualAttendance || 0]));

  return (
    <section className="smart-demand-panel" aria-labelledby="smart-demand-title">
      <div className="panel-heading">
        <div><p className="eyebrow">BASELINE FORECAST · DATA ACCUMULATES FROM CHECK-INS</p><h2 id="smart-demand-title">Smart Food Demand Prediction</h2><p>Predictions use approved active students’ EAT choices and prior actual attendance. QR attendance measures participation, not food consumption.</p></div>
        <div className="smart-demand-filters">
          <label>Date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
          <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value)}>{mealNames.map((name) => <option key={name} value={name}>{mealLabel(name)}</option>)}</select></label>
        </div>
      </div>
      {loading ? <div className="loading-line" role="status">Calculating from recorded dining data…</div> : forecast ? (
        <>
          <div className="demand-metrics">
            <article><span>Selected EAT</span><strong>{forecast.eatCount}</strong></article>
            <article><span>Predicted attendance</span><strong>{forecast.predictedAttendance}</strong></article>
            <article><span>Actual attendance</span><strong>{forecast.actualAttendance ?? "Not recorded"}</strong></article>
            <article><span>Recommended preparation</span><strong>{forecast.recommendedQuantityKg == null ? "Unavailable" : `${formatQuantity(forecast.recommendedQuantityKg)} kg`}</strong></article>
            <article><span>Avg. consumption / attendee</span><strong>{forecast.averageConsumptionPerStudentGrams == null ? "No measured history" : `${formatQuantity(forecast.averageConsumptionPerStudentGrams)} g`}</strong></article>
            <article><span>Historical attendance rate</span><strong>{forecast.historicalAttendanceDays ? `${formatQuantity(forecast.historicalAttendanceRate * 100)}%` : "No history"}</strong></article>
          </div>
          <div className="demand-meta"><span className={`confidence-tag confidence-${forecast.confidence}`}>{forecast.confidence} confidence</span><span>{forecast.historicalAttendanceDays} historical day(s)</span><span>Previous actual: {forecast.previousAttendance ?? "Unavailable"}</span><span>{forecast.dayOfWeek}</span></div>
          <p className="demand-availability">{forecast.dataAvailability}</p>
          <div className="demand-chart" role="img" aria-label={`${mealLabel(meal)} predicted and actual attendance for the last seven days`}>
            <h3>Predicted vs actual · {mealLabel(meal)}</h3>
            {history.length ? history.map((item) => (
              <div className="demand-chart-row" key={`${item.date}-${item.meal}`}>
                <time>{item.date}</time>
                <div className="demand-chart-bars">
                  <div className="demand-chart-track"><span className="predicted-bar" style={{ width: `${(item.predictedAttendance / maxAttendance) * 100}%` }} /></div>
                  <div className="demand-chart-track"><span className="actual-bar" style={{ width: `${((item.actualAttendance || 0) / maxAttendance) * 100}%` }} /></div>
                </div>
                <strong>{item.predictedAttendance} / {item.actualAttendance ?? "—"}</strong>
              </div>
            )) : <p className="empty-notifications">No saved prediction history in this range yet.</p>}
            <p className="demand-chart-legend"><span><i className="predicted-bar" />Predicted</span><span><i className="actual-bar" />Actual</span></p>
          </div>
        </>
      ) : <p className="empty-notifications">Prediction data is currently unavailable.</p>}
    </section>
  );
}

function PreparationAnalytics({ data }) {
  return (
    <div className="preparation-analytics">
      <section>
        <h3>Daily preparation and discard trend</h3>
        <div className="report-table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Unit</th><th>Prepared</th><th>Served</th><th>Remaining</th><th>Discarded</th><th>Discarded %</th></tr></thead>
            <tbody>
              {(data.dailyTotalsByUnit || []).map((item) => (
                <tr key={`${item.date}-${item.unit}`}>
                  <th>{item.date}</th>
                  <td>{item.unit}</td>
                  <td>{formatQuantity(item.quantityPrepared)}</td>
                  <td>{formatQuantity(item.quantityServed)}</td>
                  <td>{formatQuantity(item.quantityRemaining)}</td>
                  <td>{formatQuantity(item.quantityDiscarded)}</td>
                  <td>{formatQuantity(item.discardedPercentage)}%</td>
                </tr>
              ))}
              {!data.dailyTotalsByUnit?.length && <tr><td className="empty-row" colSpan="7">No daily trend data in this date range.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>Most discarded food items</h3>
        <div className="report-table-wrap">
          <table>
            <thead><tr><th>Food item</th><th>Unit</th><th>Recorded discarded</th></tr></thead>
            <tbody>
              {(data.mostDiscardedItems || []).map((item) => (
                <tr key={`${item.foodItem}-${item.unit}`}>
                  <th>{item.foodItem}</th>
                  <td>{item.unit}</td>
                  <td>{formatQuantity(item.quantityDiscarded)}</td>
                </tr>
              ))}
              {!data.mostDiscardedItems?.length && <tr><td className="empty-row" colSpan="3">No discard records in this date range.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="food-safety-note">Financial waste estimates are unavailable because ingredient cost data has not been configured.</p>
    </div>
  );
}

function AdminFeedbackSection({ onMessage }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [meal, setMeal] = useState("");
  const [rating, setRating] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (meal) params.set("meal", meal);
    if (rating) params.set("rating", rating);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [from, meal, page, rating, search, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest(`/admin/feedback?${query}`);
      setData(result);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function markReviewed(item) {
    try {
      await apiRequest(`/admin/feedback/${item._id}/reviewed`, {
        method: "PATCH",
        body: { reviewed: !item.reviewed },
      });
      await load();
    } catch (requestError) {
      onMessage({ text: requestError.message, error: true });
    }
  }

  return (
    <section className="admin-section">
      <div className="panel-heading">
        <div><p className="eyebrow">STUDENT REVIEWS</p><h2>Feedback &amp; Ratings</h2><p>Low ratings are highlighted. Reviews remain saved and can only be marked reviewed, not deleted.</p></div>
      </div>
      {error && <div className="notice notice-error" role="status">{error}</div>}
      <div className="summary-grid feedback-summary">
        <article className="summary-card"><span>Average rating</span><strong>{data?.averageRating == null ? "—" : `${data.averageRating.toFixed(1)} / 5`}</strong><small>Across current filters</small></article>
        <article className="summary-card"><span>Total reviews</span><strong>{data?.reviewCount ?? "—"}</strong><small>Saved student reviews</small></article>
        <article className="summary-card"><span>Low ratings</span><strong>{data ? Object.values(data.mealSummaries).reduce((sum, item) => sum + item.lowRatingCount, 0) : "—"}</strong><small>One- and two-star feedback</small></article>
      </div>
      <div className="feedback-meal-summaries">
        {mealNames.map((name) => {
          const summary = data?.mealSummaries?.[name];
          return <article className="summary-card" key={name}><span>{mealLabel(name)}</span><strong>{summary?.averageRating == null ? "—" : `${summary.averageRating.toFixed(1)} / 5`}</strong><small>{summary?.reviewCount ?? 0} reviews · {summary?.lowRatingCount ?? 0} low</small></article>;
        })}
      </div>
      <div className="filter-bar feedback-filters">
        <label>From<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
        <label>To<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
        <label>Meal<select value={meal} onChange={(event) => { setMeal(event.target.value); setPage(1); }}><option value="">All meals</option>{mealNames.map((name) => <option key={name} value={name}>{mealLabel(name)}</option>)}</select></label>
        <label>Rating<select value={rating} onChange={(event) => { setRating(event.target.value); setPage(1); }}><option value="">All ratings</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}</select></label>
        <label>Search comments<input value={search} maxLength="100" onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search written feedback" /></label>
      </div>
      {loading ? <div className="loading-line" role="status">Loading student feedback…</div> : (
        <div className="report-table-wrap feedback-review-table"><table><thead><tr><th>Meal / Date</th><th>Rating</th><th>Feedback</th><th>Student</th><th>Submitted</th><th>Review status</th><th>Action</th></tr></thead><tbody>
          {(data?.feedback || []).map((item) => <tr className={item.rating <= 2 ? "feedback-low-rating" : ""} key={item._id}>
            <th>{mealLabel(item.meal)}<small>{item.date}</small></th>
            <td aria-label={`${item.rating} out of 5 stars`}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)} <small>{item.rating}/5</small></td>
            <td>{item.feedback || "No written comment"}</td>
            <td>{item.studentId?.name || "Student"}</td>
            <td>{new Date(item.createdAt).toLocaleString()}</td>
            <td>{item.reviewed ? "Reviewed" : "Needs review"}</td>
            <td><button className="table-action" type="button" onClick={() => markReviewed(item)}>{item.reviewed ? "Reopen" : "Mark reviewed"}</button></td>
          </tr>)}
          {!data?.feedback?.length && <tr><td className="empty-row" colSpan="7">No feedback matches these filters yet.</td></tr>}
        </tbody></table></div>
      )}
      <div className="pagination"><span>{data?.total ?? 0} reviews · Page {page} of {data?.pages ?? 1}</span><div><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={page >= (data?.pages || 1) || loading} onClick={() => setPage(page + 1)}>Next</button></div></div>
    </section>
  );
}

function InventorySection({ onMessage }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [expiringWithin, setExpiringWithin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (lowStock) params.set("lowStock", "true");
      if (expiringWithin) params.set("expiringWithin", expiringWithin);
      const result = await apiRequest(`/admin/inventory?${params}`);
      setItems(result.items);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [expiringWithin, lowStock, search]);

  useEffect(() => {
    const timer = window.setTimeout(loadInventory, 180);
    return () => window.clearTimeout(timer);
  }, [loadInventory]);

  async function addItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    try {
      await apiRequest("/admin/inventory", {
        method: "POST",
        body: {
          name: values.get("name"),
          quantity: Number(values.get("quantity") || 0),
          unit: values.get("unit"),
          lowStockThreshold: Number(values.get("lowStockThreshold") || 0),
          supplier: values.get("supplier"),
          purchaseDate: values.get("purchaseDate") || null,
          expiryDate: values.get("expiryDate") || null,
        },
      });
      form.reset();
      onMessage({ text: "Inventory item added.", error: false });
      await loadInventory();
    } catch (requestError) {
      onMessage({ text: requestError.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(event, item) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await apiRequest(`/admin/inventory/${item._id}`, {
        method: "PATCH",
        body: {
          name: values.get("name"),
          lowStockThreshold: Number(values.get("lowStockThreshold") || 0),
          supplier: values.get("supplier"),
          purchaseDate: values.get("purchaseDate") || null,
          expiryDate: values.get("expiryDate") || null,
        },
      });
      onMessage({ text: `${item.name} details updated.`, error: false });
      await loadInventory();
    } catch (requestError) {
      onMessage({ text: requestError.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  async function recordTransaction(event, item) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    try {
      await apiRequest(`/admin/inventory/${item._id}/transactions`, {
        method: "POST",
        body: {
          type: values.get("type"),
          quantity: Number(values.get("quantity")),
          unit: item.unit,
          note: values.get("note"),
        },
      });
      form.reset();
      onMessage({ text: `${item.name} stock transaction recorded.`, error: false });
      await loadInventory();
    } catch (requestError) {
      onMessage({ text: requestError.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section">
      <div className="panel-heading"><div><p className="eyebrow">KITCHEN STOCK</p><h2>Inventory management</h2><p>Stock changes are recorded as transactions. Meal estimates do not automatically deduct inventory.</p></div></div>
      <form className="panel inventory-create-form" onSubmit={addItem}>
        <h3>Add inventory item</h3>
        <label>Item name<input name="name" maxLength="80" required /></label>
        <label>Opening quantity<input name="quantity" type="number" min="0" max="1000000000" step="any" defaultValue="0" required /></label>
        <label>Unit<select name="unit" required>{["kg", "g", "L", "ml", "piece"].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label>Low-stock threshold<input name="lowStockThreshold" type="number" min="0" max="1000000000" step="any" defaultValue="0" required /></label>
        <label>Supplier (optional)<input name="supplier" maxLength="120" /></label>
        <label>Purchase date<input name="purchaseDate" type="date" /></label>
        <label>Expiry date<input name="expiryDate" type="date" /></label>
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Add item"}</button>
      </form>
      <div className="filter-bar inventory-filters">
        <label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Item or supplier" /></label>
        <label>Stock filter<select value={lowStock ? "low" : "all"} onChange={(event) => setLowStock(event.target.value === "low")}><option value="all">All stock</option><option value="low">Low-stock alerts</option></select></label>
        <label>Expiry filter<select value={expiringWithin} onChange={(event) => setExpiringWithin(event.target.value)}><option value="">All expiry dates</option><option value="30">Expiring in 30 days</option><option value="90">Expiring in 90 days</option></select></label>
      </div>
      {error && <div className="notice notice-error" role="status">{error}</div>}
      {loading ? <div className="loading-line" role="status">Loading inventory…</div> : (
        <div className="inventory-item-list">
          {items.map((item) => (
            <article className="panel inventory-item-card" key={item._id}>
              <div className="inventory-item-heading"><div><h3>{item.name}</h3><strong>{formatQuantity(item.currentQuantity)} {item.unit}</strong></div><div className="inventory-alerts">{item.isLowStock && <span className="inventory-alert">Low stock</span>}{item.isExpired && <span className="inventory-alert expired">Expired</span>}{item.isExpiringSoon && <span className="inventory-alert">Expiry approaching</span>}</div></div>
              <form className="inventory-edit-form" onSubmit={(event) => updateItem(event, item)}>
                <label>Item name<input name="name" maxLength="80" defaultValue={item.name} required /></label>
                <label>Low threshold<input name="lowStockThreshold" type="number" min="0" max="1000000000" step="any" defaultValue={item.lowStockThreshold} required /></label>
                <label>Supplier<input name="supplier" maxLength="120" defaultValue={item.supplier} /></label>
                <label>Purchase date<input name="purchaseDate" type="date" defaultValue={item.purchaseDate || ""} /></label>
                <label>Expiry date<input name="expiryDate" type="date" defaultValue={item.expiryDate || ""} /></label>
                <button className="button button-outline" type="submit" disabled={saving}>Save details</button>
              </form>
              <form className="inventory-transaction-form" onSubmit={(event) => recordTransaction(event, item)}>
                <label>Transaction<select name="type"><option value="received">Stock received</option><option value="used">Stock used</option></select></label>
                <label>Quantity ({item.unit})<input name="quantity" type="number" min="0.000001" max="1000000000" step="any" required /></label>
                <label>Note<input name="note" maxLength="300" /></label>
                <button className="button button-primary" type="submit" disabled={saving}>Record stock</button>
              </form>
              <details className="inventory-history">
                <summary>Transaction history ({item.transactions?.length || 0})</summary>
                <div className="report-table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Quantity</th><th>Note</th></tr></thead><tbody>
                  {(item.transactions || []).slice().reverse().map((transaction) => <tr key={transaction._id}><td>{new Date(transaction.createdAt).toLocaleString()}</td><th>{transaction.type}</th><td>{transaction.type === "received" ? "+" : "−"}{formatQuantity(transaction.quantity)} {transaction.unit}</td><td>{transaction.note || "—"}</td></tr>)}
                  {!item.transactions?.length && <tr><td colSpan="4" className="empty-row">No stock transactions recorded.</td></tr>}
                </tbody></table></div>
              </details>
            </article>
          ))}
          {!items.length && <div className="empty-notifications">No inventory items match these filters.</div>}
        </div>
      )}
    </section>
  );
}

function AttendanceSection({ date, onMessage }) {
  const [attendance, setAttendance] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingMeal, setSavingMeal] = useState("");

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const [result, stats] = await Promise.all([
        apiRequest(`/admin/attendance?date=${encodeURIComponent(date)}`),
        apiRequest(`/admin/statistics?date=${encodeURIComponent(date)}`),
      ]);
      setAttendance(result.attendance);
      setStatistics(stats);
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setLoading(false);
    }
  }, [date, onMessage]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  async function save(event, meal) {
    event.preventDefault();
    const form = event.currentTarget;
    const count = Number(new FormData(form).get("attendanceCount"));
    setSavingMeal(meal);
    try {
      await apiRequest("/admin/attendance", {
        method: "PUT",
        body: { date, meal, attendanceCount: count },
      });
      onMessage({ text: `${mealLabel(meal)} attendance saved for ${date}.`, error: false });
      await loadAttendance();
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setSavingMeal("");
    }
  }

  return (
    <section className="panel admin-section">
      <div className="panel-heading"><div><p className="eyebrow">ACTUAL PARTICIPATION</p><h2>Dining attendance</h2><p>Record actual attendance separately from EAT preferences; a saved preference does not prove attendance.</p></div><strong className="demand-date">Meal date: {date}</strong></div>
      {loading ? <div className="loading-line" role="status">Loading attendance records…</div> : (
        <div className="report-table-wrap"><table><thead><tr><th>Meal</th><th>Expected EAT</th><th>Actual attendance</th><th>Difference</th><th>Record count</th><th>Save actual attendance</th></tr></thead><tbody>
          {mealNames.map((meal) => {
            const record = attendance.find((item) => item.meal === meal);
            const expected = statistics?.meals?.[meal]?.eat ?? 0;
            return <tr key={meal}>
              <th>{mealLabel(meal)}</th>
              <td>{expected}</td>
              <td>{record?.attendanceCount ?? "Not recorded"}</td>
              <td>{record ? record.difference > 0 ? `+${record.difference}` : record.difference : "—"}</td>
              <td>{record ? new Date(record.updatedAt).toLocaleString() : "—"}</td>
              <td><form className="attendance-form" onSubmit={(event) => save(event, meal)}>
                <label><span className="sr-only">Actual {mealLabel(meal)} attendance</span><input name="attendanceCount" type="number" min="0" max={statistics?.totalStudents || 1000000} step="1" defaultValue={record?.attendanceCount ?? ""} required /></label>
                <button className="button button-outline" type="submit" disabled={Boolean(savingMeal)}>{savingMeal === meal ? "Saving…" : "Save"}</button>
              </form></td>
            </tr>;
          })}
        </tbody></table></div>
      )}
      <p className="attendance-disclaimer">This is a legacy aggregate record. Individual check-ins are recorded separately in the Dining Attendance Scanner.</p>
    </section>
  );
}

function DiningAttendanceScanner({ onMessage }) {
  const [meal, setMeal] = useState("breakfast");
  const [attendanceDate, setAttendanceDate] = useState(currentIstDate);
  const [attendance, setAttendance] = useState([]);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const scannerRef = useRef(null);
  const processingRef = useRef(false);

  const loadAttendance = useCallback(async () => {
    try {
      const result = await apiRequest(`/admin/attendance/students?date=${encodeURIComponent(attendanceDate)}&meal=${meal}`);
      setAttendance(result.attendance || []);
    } catch (error) {
      onMessage({ text: error.message, error: true });
    }
  }, [attendanceDate, meal, onMessage]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  async function stopCamera() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {}
    scannerRef.current = null;
    setRunning(false);
  }

  useEffect(() => () => {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) scanner.stop().catch(() => {});
  }, []);

  async function submitScannedToken(token) {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      const response = await apiRequest("/admin/attendance/scan", {
        method: "POST",
        body: { token, meal },
      });
      setResultMessage(`${response.student.name} checked in for ${mealLabel(meal)}.`);
      onMessage({ text: `${response.student.name} checked in for ${mealLabel(meal)}.`, error: false });
      await stopCamera();
      await loadAttendance();
    } catch (error) {
      setResultMessage(error.message);
      onMessage({ text: error.message, error: true });
      await stopCamera();
    } finally {
      processingRef.current = false;
    }
  }

  async function startCamera() {
    setStarting(true);
    setResultMessage("");
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw new Error("No camera is available. Use the authorized staff fallback below.");
      const camera = cameras.find((item) => /back|rear|environment/i.test(item.label)) || cameras[0];
      const scanner = new Html5Qrcode("messmate-qr-camera");
      scannerRef.current = scanner;
      await scanner.start(
        camera.id,
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => submitScannedToken(decodedText),
        () => {}
      );
      setRunning(true);
    } catch (error) {
      scannerRef.current = null;
      setResultMessage(error.message || "Camera access failed. Check browser permission or use staff fallback.");
      onMessage({ text: error.message || "Camera access failed. Use the authorized staff fallback.", error: true });
    } finally {
      setStarting(false);
    }
  }

  async function manualCheckIn(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const rollNumber = new FormData(form).get("rollNumber");
    setManualBusy(true);
    try {
      const response = await apiRequest("/admin/attendance/manual", {
        method: "POST",
        body: { rollNumber, meal },
      });
      setResultMessage(`${response.student.name} checked in for ${mealLabel(meal)}.`);
      onMessage({ text: `${response.student.name} checked in for ${mealLabel(meal)}.`, error: false });
      form.reset();
      await loadAttendance();
    } catch (error) {
      setResultMessage(error.message);
      onMessage({ text: error.message, error: true });
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <section className="admin-section">
      <div className="panel-heading"><div><p className="eyebrow">LIVE MESS CHECK-IN</p><h2>Dining Attendance Scanner</h2><p>Scan the student’s short-lived QR during the selected meal window. Attendance is verified and saved against the authenticated student record.</p></div>
        <label className="scanner-meal-select">Meal<select value={meal} onChange={(event) => setMeal(event.target.value)}>{mealNames.map((name) => <option key={name} value={name}>{mealLabel(name)}</option>)}</select></label>
      </div>
      <div className="scanner-layout">
        <div className="scanner-camera-panel">
          <div id="messmate-qr-camera" className="scanner-camera" aria-label="QR scanner camera preview" />
          <div className="scanner-actions">
            {!running ? <button className="button button-primary" type="button" onClick={startCamera} disabled={starting}>{starting ? "Requesting camera…" : "Start camera scanner"}</button> : <button className="button button-outline" type="button" onClick={stopCamera}>Stop scanner</button>}
            <span>Allow camera access when prompted. Keep the student’s QR inside the frame.</span>
          </div>
          {resultMessage && <p className="scanner-result" role="status">{resultMessage}</p>}
        </div>
        <form className="scanner-manual-form" onSubmit={manualCheckIn}>
          <p className="eyebrow">AUTHORIZED STAFF FALLBACK</p>
          <h3>Manual check-in</h3>
          <p>Use only when camera access is unavailable. Student approval and active status are still verified.</p>
          <label>Student roll number<input name="rollNumber" maxLength="30" autoComplete="off" required /></label>
          <button className="button button-secondary" type="submit" disabled={manualBusy}>{manualBusy ? "Recording…" : "Record check-in"}</button>
        </form>
      </div>
      <div className="panel-heading scanner-list-heading"><div><p className="eyebrow">{attendanceDate} · {mealLabel(meal)}</p><h3>Student check-ins ({attendance.length})</h3></div><label className="scanner-date-select">Attendance date<input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></label><button className="button button-outline" type="button" onClick={loadAttendance}>Refresh list</button></div>
      <div className="report-table-wrap"><table><thead><tr><th>Student</th><th>Roll number</th><th>Status</th><th>Scanned at</th></tr></thead><tbody>
        {attendance.map((record) => <tr key={record._id}><th>{record.studentId?.name || "Student record unavailable"}</th><td>{record.studentId?.rollNumber || "—"}</td><td>{record.status}</td><td>{new Date(record.scannedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</td></tr>)}
        {!attendance.length && <tr><td className="empty-row" colSpan="4">No student check-ins recorded for this meal and date.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

function ReportsSection({ date, onMessage }) {
  const [period, setPeriod] = useState("day");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const bounds = useMemo(() => {
    const end = new Date(`${date}T00:00:00.000Z`);
    const start = new Date(end);
    if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
    if (period === "month") start.setUTCDate(1);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }, [date, period]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiRequest(`/admin/analytics?from=${bounds.from}&to=${bounds.to}`));
    } catch (error) {
      onMessage({ text: error.message, error: true });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [bounds.from, bounds.to, onMessage]);

  useEffect(() => { loadReports(); }, [loadReports]);
  const demand = data?.mealDemand;
  const maxEat = Math.max(...(demand?.daily || []).map((item) => item.eat), 1);

  return (
    <section className="admin-section">
      <div className="panel-heading"><div><p className="eyebrow">DATA-DRIVEN MESSMATE</p><h2>Analytics &amp; reports</h2><p>All cards and trends are calculated from saved preferences, preparation, ratings, inventory transactions, and attendance.</p></div><strong className="demand-date">Through {date}</strong></div>
      <div className="period-switcher" role="group" aria-label="Analytics period">
        {[["day", "Daily"], ["week", "Last 7 days"], ["month", "Month to date"]].map(([key, label]) => <button key={key} className={`button ${period === key ? "button-primary" : "button-outline"}`} type="button" onClick={() => setPeriod(key)}>{label}</button>)}
        <span>{bounds.from} – {bounds.to}</span>
      </div>
      {loading ? <div className="loading-line" role="status">Loading real report data…</div> : data && (
        <>
          <div className="summary-grid report-summary-grid">
            <article className="summary-card"><span>Eligible students</span><strong>{data.eligibleStudents}</strong></article>
            <article className="summary-card"><span>EAT preferences</span><strong>{demand.eat}</strong></article>
            <article className="summary-card"><span>SKIP preferences</span><strong>{demand.skip}</strong></article>
            <article className="summary-card"><span>Not selected</span><strong>{demand.notSelected}</strong></article>
            <article className="summary-card"><span>Average rating</span><strong>{data.ratings.average == null ? "—" : `${data.ratings.average.toFixed(1)} / 5`}</strong><small>{data.ratings.count} reviews</small></article>
          </div>
          <div className="panel report-panel">
            <div className="panel-heading"><div><p className="eyebrow">MEAL PARTICIPATION</p><h2>Daily EAT selections</h2></div></div>
            {demand.daily.some((item) => item.eat > 0) ? <div className="analytics-bars">{demand.daily.map((item) => <div className="analytics-bar-row" key={item.date}><time>{item.date}</time><div className="analytics-bar-track"><span style={{ width: `${(item.eat / maxEat) * 100}%` }} /></div><strong>{item.eat}</strong></div>)}</div> : <p className="empty-notifications">No EAT preferences in this period.</p>}
          </div>
          <div className="report-cards-grid">
            <article className="panel report-panel"><h3>Food waste</h3>{data.foodWaste.length ? data.foodWaste.map((item) => <p key={item.unit}>{item.unit}: {formatQuantity(item.discarded)} discarded of {formatQuantity(item.prepared)} prepared</p>) : <p className="empty-notifications">No preparation records for this period.</p>}</article>
            <article className="panel report-panel"><h3>Meal ratings</h3>{mealNames.map((meal) => <p key={meal}>{mealLabel(meal)}: {data.ratings.byMeal[meal].averageRating == null ? "—" : `${data.ratings.byMeal[meal].averageRating.toFixed(1)} / 5`} ({data.ratings.byMeal[meal].reviewCount})</p>)}</article>
            <article className="panel report-panel"><h3>Inventory usage</h3>{data.inventoryUsage.length ? data.inventoryUsage.map((item) => <p key={item.unit}>{formatQuantity(item.quantity)} {item.unit} used</p>) : <p className="empty-notifications">No inventory usage records for this period.</p>}</article>
            <article className="panel report-panel"><h3>Actual attendance</h3>{data.attendance.length ? data.attendance.map((item) => <p key={`${item.date}-${item.meal}`}>{item.date} · {mealLabel(item.meal)}: {item.actual} actual / {item.expected} EAT ({item.difference > 0 ? "+" : ""}{item.difference})</p>) : <p className="empty-notifications">No actual attendance records for this period.</p>}</article>
          </div>
        </>
      )}
    </section>
  );
}

function ExportReportsSection({ date, onMessage }) {
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [type, setType] = useState("meal-preferences");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setFrom(date);
    setTo(date);
  }, [date]);

  async function download(event) {
    event.preventDefault();
    setDownloading(true);
    try {
      const params = new URLSearchParams({ type, from, to });
      await apiDownload(`/admin/export?${params}`);
      onMessage({ text: "Report downloaded.", error: false });
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="panel admin-section export-panel">
      <div className="panel-heading"><div><p className="eyebrow">ADMIN-ONLY DATA</p><h2>Export reports</h2><p>CSV values are escaped, formula-like cells are neutralized, and date ranges are limited to one year.</p></div></div>
      <form className="export-form" onSubmit={download}>
        <label>Report<select value={type} onChange={(event) => setType(event.target.value)}>{[["meal-preferences", "Meal preferences"], ["food-preparation", "Food preparation & waste"], ["inventory", "Inventory & stock transactions"], ["feedback", "Feedback & ratings"], ["attendance", "Dining attendance"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>From<input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="button button-primary" type="submit" disabled={downloading}>{downloading ? "Preparing CSV…" : "Download CSV"}</button>
      </form>
    </section>
  );
}

function IngredientEstimates({ estimate }) {
  const ingredients = estimate?.ingredients || [];
  const hasUnconfiguredServings =
    (estimate?.unconfiguredVegServings || 0) > 0 ||
    (estimate?.unconfiguredNonVegServings || 0) > 0;

  return (
    <div className="ingredient-estimates">
      <h4>Ingredient estimate</h4>
      {ingredients.length > 0 ? (
        <div className="ingredient-table-wrap">
          <table>
            <thead><tr><th>Ingredient</th><th>Base requirement</th><th>Extra buffer</th><th>Planned total</th></tr></thead>
            <tbody>{ingredients.map((ingredient) => (
              <tr key={`${ingredient.name}-${ingredient.unit}`}>
                <th>{ingredient.name}</th>
                <td>{formatQuantity(ingredient.baseQuantity)} {ingredient.unit}</td>
                <td>+{formatQuantity(ingredient.bufferQuantity)} {ingredient.unit}</td>
                <td>{formatQuantity(ingredient.plannedQuantity)} {ingredient.unit}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <p>No ingredient quantities are configured for this date; no ingredient estimate is available.</p>
      )}
      {hasUnconfiguredServings && (
        <p className="ingredient-warning">
          Estimates are incomplete: {estimate.unconfiguredVegServings} vegetarian and {estimate.unconfiguredNonVegServings} non-vegetarian confirmed servings have no configured ingredient quantities.
        </p>
      )}
      {(estimate?.incomplete || 0) > 0 && (
        <p className="ingredient-warning">
          {estimate.incomplete} EAT selection(s) have no valid food preference and are excluded from category and ingredient estimates.
        </p>
      )}
    </div>
  );
}

function UsersSection({ users, search, setSearch, role, setRole, status, setStatus, page, pages, setPage, onSetActive }) {
  return (
    <section className="panel admin-section">
      <div className="panel-heading"><div><p className="eyebrow">REGISTERED ACCOUNTS</p><h2>Users</h2></div></div>
      <div className="filter-bar">
        <input aria-label="Search users" placeholder="Search name, email, or mobile" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option><option value="student">Students</option><option value="admin">Admins</option></select>
        <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </div>
      <div className="report-table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th>Registered</th><th>Last login</th><th>Action</th></tr></thead><tbody>
        {users.map((user) => <tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td>{user.mobile}</td><td><span className={`role-badge ${user.role}`}>{user.role}</span></td><td><span className={`status-pill ${user.isActive ? "active" : "inactive"}`}>{user.isActive ? "Active" : "Inactive"}</span></td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td><td><button className="table-action" type="button" onClick={() => onSetActive(user, !user.isActive)}>{user.isActive ? "Deactivate" : "Activate"}</button></td></tr>)}
        {!users.length && <tr><td className="empty-row" colSpan="7">No accounts match these filters.</td></tr>}
      </tbody></table></div>
      <div className="pagination"><span>Page {page} of {pages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
    </section>
  );
}

function MealsSection({ mealName, setMealName, status, setStatus, type, setType, rows }) {
  return (
    <section className="panel admin-section">
      <div className="panel-heading"><div><p className="eyebrow">DAILY MEAL MONITOR</p><h2>Student meal choices</h2></div>
        <div className="meal-tabs">{mealNames.map((name) => <button type="button" className={name === mealName ? "active" : ""} key={name} onClick={() => setMealName(name)}>{mealLabel(name)}</button>)}</div>
      </div>
      <div className="filter-bar"><select aria-label="Filter meal status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All choices</option><option value="eat">Eat</option><option value="skip">Skip</option><option value="not-selected">Not selected</option></select><select aria-label="Filter meal type" value={type} onChange={(event) => setType(event.target.value)}><option value="">All meal types</option><option value="veg">Vegetarian</option><option value="nonVeg">Non-vegetarian</option></select></div>
      <div className="report-table-wrap"><table><thead><tr><th>Student</th><th>Email</th><th>Breakfast</th><th>Lunch</th><th>Tea Time</th><th>Dinner</th><th>Account</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.student.id}>
          <td>{row.student.name}</td>
          <td>{row.student.email}</td>
          {mealNames.map((name) => {
            const choice = row[name];
            return <td key={name}><span className={`status-pill ${choice.status}`}>{studentMealChoice(choice)}</span></td>;
          })}
          <td>{row.student.isActive ? "Active" : "Inactive"}</td>
        </tr>)}
        {!rows.length && <tr><td className="empty-row" colSpan="6">No meal records match these filters.</td></tr>}
      </tbody></table></div>
    </section>
  );
}

function MenuSection({ menuForm, onChange, onIngredientChange, onHolidayChange, onSubmit, exists, date }) {
  const sunday = new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
  return (
    <section className="panel admin-section">
      <div className="panel-heading"><div><p className="eyebrow">DAILY MENU EDITOR</p><h2>{exists ? "Update menu" : "Create menu"}</h2><p>One menu per date. Add one item per line for each diet option.</p></div></div>
      <div className="menu-timing-strip" aria-label="Meal serving times">
        <span><strong>Breakfast</strong>{sunday || menuForm.isHoliday ? "8:00 AM – 9:30 AM" : "6:30 AM – 8:30 AM"}</span>
        <span><strong>Lunch</strong>12:30 PM – 2:30 PM</span>
        <span><strong>Tea / Snacks</strong>6:00 PM – 7:00 PM</span>
        <span><strong>Dinner</strong>8:00 PM – 9:45 PM</span>
      </div>
      <form className="menu-editor" onSubmit={onSubmit}>
        <label className="holiday-toggle">
          <input
            type="checkbox"
            checked={menuForm.isHoliday}
            onChange={(event) => onHolidayChange(event.target.checked)}
          />
          Sunday / mess holiday (uses the special breakfast timing)
        </label>
        {mealNames.map((meal) => <fieldset className="menu-editor-meal" key={meal}><legend>{mealLabel(meal)}</legend>
          <div><label htmlFor={`${meal}-veg`}>Vegetarian</label><textarea id={`${meal}-veg`} rows="5" value={menuForm[meal].veg} onChange={(event) => onChange(meal, "veg", event.target.value)} placeholder={"Rice\nDal\nSeasonal vegetables"} maxLength="2500" /></div>
          <div><label htmlFor={`${meal}-nonveg`}>Non-vegetarian</label><textarea id={`${meal}-nonveg`} rows="5" value={menuForm[meal].nonVeg} onChange={(event) => onChange(meal, "nonVeg", event.target.value)} placeholder={"Rice\nChicken curry"} maxLength="2500" /></div>
          {mealTypes.map((type) => (
            <div className="ingredient-config" key={`${meal}-${type}`}>
              <label htmlFor={`${meal}-${type}-ingredients`}>
                {type === "veg" ? "Vegetarian" : "Non-vegetarian"} ingredients per confirmed serving
              </label>
              <textarea
                id={`${meal}-${type}-ingredients`}
                rows="3"
                value={menuForm[meal].ingredients[type]}
                onChange={(event) => onIngredientChange(meal, type, event.target.value)}
                placeholder="Ingredient name | quantity | unit"
                maxLength="2500"
              />
              <small>Optional. Enter actual measured values only; units: g, kg, ml, L, or piece. No values are assumed.</small>
            </div>
          ))}
        </fieldset>)}
        <button className="button button-primary" type="submit">Save menu for {date}</button>
      </form>
    </section>
  );
}

function SpecialMenuManagement({ date, specialMenus, onDateChange, onMessage, onChanged }) {
  const [draft, setDraft] = useState(() => emptySpecialMenu(date));
  const [editingId, setEditingId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editingId) setDraft((current) => ({ ...current, date }));
  }, [date, editingId]);

  function startNew() {
    setDraft(emptySpecialMenu(date));
    setEditingId("");
    setPreviewOpen(false);
    setEditorOpen(true);
  }

  function editSpecial(special) {
    setDraft(specialMenuToForm(special));
    setEditingId(special._id);
    setPreviewOpen(false);
    setEditorOpen(true);
  }

  function updateMeal(meal, field, value) {
    setDraft((current) => ({
      ...current,
      meals: { ...current.meals, [meal]: { ...current.meals[meal], [field]: value } },
    }));
  }

  async function saveSpecial(event) {
    event.preventDefault();
    if (draft.isPublished && !previewOpen) {
      setPreviewOpen(true);
      onMessage({ text: "Review the preview, then select Save & publish.", error: false });
      return;
    }
    const meals = Object.fromEntries(mealNames.filter((meal) => draft.meals[meal].enabled).map((meal) => [meal, {
      veg: lines(draft.meals[meal].veg),
      nonVeg: lines(draft.meals[meal].nonVeg),
    }]));
    setSaving(true);
    try {
      await apiRequest(editingId ? `/admin/special-menus/${editingId}` : "/admin/special-menus", {
        method: editingId ? "PUT" : "POST",
        body: {
          occasionName: draft.occasionName,
          date: draft.date,
          meals,
          description: draft.description,
          isPublished: draft.isPublished,
        },
      });
      setEditorOpen(false);
      setEditingId("");
      setPreviewOpen(false);
      const dateChanged = draft.date !== date;
      if (dateChanged) onDateChange(draft.date);
      else await onChanged();
      onMessage({ text: draft.isPublished ? "Special menu published." : "Special menu saved as a draft.", error: false });
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(special) {
    try {
      await apiRequest(`/admin/special-menus/${special._id}/published`, {
        method: "PATCH",
        body: { isPublished: !special.isPublished },
      });
      await onChanged();
      onMessage({ text: special.isPublished ? "Special menu unpublished." : "Special menu published.", error: false });
    } catch (error) {
      onMessage({ text: error.message, error: true });
    }
  }

  async function deleteSpecial(special) {
    if (!window.confirm(`Delete the special menu for ${special.occasionName}?`)) return;
    try {
      await apiRequest(`/admin/special-menus/${special._id}`, { method: "DELETE" });
      await onChanged();
      onMessage({ text: "Special menu deleted.", error: false });
    } catch (error) {
      onMessage({ text: error.message, error: true });
    }
  }

  return (
    <section className="admin-section special-menu-management">
      <div className="panel-heading">
        <div><p className="eyebrow">DATE-SPECIFIC OVERRIDES</p><h2>Special Menu Management</h2><p>Published special meals replace only the selected meal categories; all other meals continue using the regular menu.</p></div>
        <button className="button button-primary" type="button" onClick={startNew}>Add Special Menu</button>
      </div>
      <div className="special-menu-list">
        {specialMenus.map((special) => (
          <article className="special-menu-admin-item" key={special._id}>
            <div className="special-menu-admin-heading">
              <div><span className={`special-menu-status${special.isPublished ? " published" : ""}`}>{special.isPublished ? "PUBLISHED" : "DRAFT"}</span><h3>{special.occasionName}</h3><time dateTime={special.date}>{special.date}</time></div>
              <div className="special-menu-actions">
                <button className="button button-outline" type="button" onClick={() => editSpecial(special)}>Edit</button>
                <button className="button button-outline" type="button" onClick={() => togglePublished(special)}>{special.isPublished ? "Unpublish" : "Publish"}</button>
                <button className="button button-outline" type="button" onClick={() => deleteSpecial(special)}>Delete</button>
              </div>
            </div>
            {special.description && <p>{special.description}</p>}
            <SpecialMenuPreview special={special} />
          </article>
        ))}
        {!specialMenus.length && <p className="empty-notifications">No special menus are saved for {date}.</p>}
      </div>
      {editorOpen && (
        <form className="special-menu-editor" onSubmit={saveSpecial}>
          <div className="panel-heading"><div><p className="eyebrow">{editingId ? "EDIT OCCASION" : "NEW OCCASION"}</p><h3>{editingId ? "Update special menu" : "Add Special Menu"}</h3></div><button className="button button-outline" type="button" onClick={() => setEditorOpen(false)}>Close</button></div>
          <div className="special-menu-fields">
            <label>Occasion name<input value={draft.occasionName} maxLength="100" required onChange={(event) => setDraft((current) => ({ ...current, occasionName: event.target.value }))} placeholder="Diwali Celebration" /></label>
            <label>Occasion date<input type="date" value={draft.date} required onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label>
            <label className="special-description-field">Description or announcement<textarea rows="2" maxLength="1000" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          <div className="special-meal-editor-grid">
            {mealNames.map((meal) => (
              <fieldset key={meal} className="special-meal-editor">
                <legend><label><input type="checkbox" checked={draft.meals[meal].enabled} onChange={(event) => updateMeal(meal, "enabled", event.target.checked)} />{meal === "teaTime" ? "Tea Time / Snacks" : mealLabel(meal)}</label></legend>
                <label>Vegetarian items<textarea rows="3" disabled={!draft.meals[meal].enabled} value={draft.meals[meal].veg} onChange={(event) => updateMeal(meal, "veg", event.target.value)} placeholder="One item per line" /></label>
                <label>Non-vegetarian items<textarea rows="3" disabled={!draft.meals[meal].enabled} value={draft.meals[meal].nonVeg} onChange={(event) => updateMeal(meal, "nonVeg", event.target.value)} placeholder="One item per line" /></label>
              </fieldset>
            ))}
          </div>
          <label className="special-publish-toggle"><input type="checkbox" checked={draft.isPublished} onChange={(event) => setDraft((current) => ({ ...current, isPublished: event.target.checked }))} />Publish after saving</label>
          <div className="special-editor-actions"><button className="button button-outline" type="button" onClick={() => setPreviewOpen((open) => !open)}>{previewOpen ? "Hide preview" : "Preview menu"}</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : draft.isPublished ? "Save & publish" : "Save as draft"}</button></div>
          {previewOpen && <div className="special-preview-panel"><p className="eyebrow">PREVIEW · {draft.date}</p><h3>{draft.occasionName || "Occasion name"}</h3>{draft.description && <p>{draft.description}</p>}<SpecialMenuPreview special={{ ...draft, ...Object.fromEntries(mealNames.filter((meal) => draft.meals[meal].enabled).map((meal) => [meal, { veg: lines(draft.meals[meal].veg), nonVeg: lines(draft.meals[meal].nonVeg) }])) }} /></div>}
        </form>
      )}
    </section>
  );
}

function SpecialMenuPreview({ special }) {
  return (
    <div className="special-menu-preview-list">
      {mealNames.filter((meal) => special[meal]).map((meal) => (
        <div key={meal}><h4>{meal === "teaTime" ? "Tea Time / Snacks" : mealLabel(meal)}</h4><p>{[
          ...(special[meal].veg || []).map((item) => `VEG: ${item}`),
          ...(special[meal].nonVeg || []).map((item) => `NON-VEG: ${item}`),
        ].join(" · ") || "No food items entered yet."}</p></div>
      ))}
      {!mealNames.some((meal) => special[meal]) && <p className="empty-notifications">Select at least one meal category.</p>}
    </div>
  );
}

function EmailSection({ notifications, onSent, onMessage }) {
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [result, setResult] = useState(null);
  const [emailSubject, setEmailSubject] = useState("MessMate - Today's Meal Selection");
  const [emailMessage, setEmailMessage] = useState("Hello,\n\nToday's menu is now available.\n\nPlease open MessMate and select whether you will have Breakfast, Lunch, Tea Time, or Dinner before the cutoff time.\n\nThank you,\nMessMate Team");
  const [requestId, setRequestId] = useState(() => {
    const stored = sessionStorage.getItem("messmateEmailRequestId");
    if (stored) return stored;
    const next = crypto.randomUUID();
    sessionStorage.setItem("messmateEmailRequestId", next);
    return next;
  });
  const [recipients, setRecipients] = useState([]);
  const [recipientMode, setRecipientMode] = useState("all");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const announcementBusyRef = useRef(false);
  const [announcementId, setAnnouncementId] = useState("");
  const [announcementSubject, setAnnouncementSubject] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementExpiry, setAnnouncementExpiry] = useState("");
  const [announcementResult, setAnnouncementResult] = useState(null);
  const announcements = notifications.filter((item) => item.kind === "announcement");

  function startNewEmailRequest() {
    const next = crypto.randomUUID();
    sessionStorage.setItem("messmateEmailRequestId", next);
    setRequestId(next);
    setResult(null);
  }

  useEffect(() => {
    let active = true;
    apiRequest("/admin/email-recipients")
      .then((response) => {
        if (active) setRecipients(response.recipients);
      })
      .catch((error) => onMessage({ text: error.message, error: true }));
    return () => { active = false; };
  }, [onMessage]);

  async function submit(event) {
    event.preventDefault();
    if (sendingRef.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const subject = String(form.get("subject") || "").trim();
    const message = String(form.get("message") || "").trim();
    if (!subject || subject.length > 160 || /[\r\n]/.test(subject)) {
      onMessage({ text: "Enter an email subject of 1–160 characters without line breaks.", error: true });
      return;
    }
    if (!message || message.length > 10000) {
      onMessage({ text: "Enter an email message of 1–10,000 characters.", error: true });
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setResult(null);
    try {
      const response = await apiRequest("/admin/send-email", {
        method: "POST",
        body: {
          subject,
          message,
          requestId,
          sendToAll: recipientMode === "all",
          recipientIds: recipientMode === "all" ? [] : selectedRecipients,
        },
      });
      setResult(response.result);
      onMessage({ text: response.message, error: false });
      await onSent();
    } catch (error) {
      if (error.result) {
        setResult(error.result);
        onMessage({ text: error.message, error: true });
      } else {
        onMessage({ text: error.message, error: true });
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function editAnnouncement(item) {
    setAnnouncementId(item._id);
    setAnnouncementSubject(item.subject);
    setAnnouncementMessage(item.message);
    setAnnouncementExpiry(item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 16) : "");
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    if (announcementBusyRef.current) return;
    announcementBusyRef.current = true;
    setAnnouncementBusy(true);
    try {
      const payload = {
        subject: announcementSubject,
        message: announcementMessage,
        expiresAt: announcementExpiry ? new Date(announcementExpiry).toISOString() : null,
        recipientIds: recipientMode === "all" ? [] : selectedRecipients,
      };
      let response;
      if (announcementId) {
        const item = announcements.find((entry) => entry._id === announcementId);
        response = await apiRequest(`/admin/announcements/${announcementId}`, {
          method: "PATCH",
          body: { ...payload, published: Boolean(item?.published) },
        });
      } else {
        response = await apiRequest("/admin/announcements", { method: "POST", body: payload });
        setAnnouncementResult(response.deliverySummary);
      }
      const wasEditing = Boolean(announcementId);
      setAnnouncementId("");
      setAnnouncementSubject("");
      setAnnouncementMessage("");
      setAnnouncementExpiry("");
      onMessage({
        text: wasEditing
          ? "Announcement updated."
          : `Announcement published successfully. In-app notifications: ${response.deliverySummary.inAppNotificationsCreated} created. Emails accepted: ${response.deliverySummary.emailsAccepted}. Emails failed: ${response.deliverySummary.emailsFailed}. Recipients skipped: ${response.deliverySummary.recipientsSkipped}.`,
        error: false,
      });
      await onSent();
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      announcementBusyRef.current = false;
      setAnnouncementBusy(false);
    }
  }

  async function retryAnnouncementEmails(item) {
    if (announcementBusyRef.current) return;
    announcementBusyRef.current = true;
    setAnnouncementBusy(true);
    try {
      const response = await apiRequest(`/admin/announcements/${item._id}/retry-failed-emails`, {
        method: "POST",
      });
      setAnnouncementResult(response.deliverySummary);
      onMessage({
        text: `Email retry completed. Accepted: ${response.deliverySummary.emailsAccepted}. Failed: ${response.deliverySummary.emailsFailed}. Skipped: ${response.deliverySummary.recipientsSkipped}.`,
        error: response.deliverySummary.emailsFailed > 0,
      });
      await onSent();
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      announcementBusyRef.current = false;
      setAnnouncementBusy(false);
    }
  }

  async function toggleAnnouncement(item) {
    setAnnouncementBusy(true);
    try {
      await apiRequest(`/admin/announcements/${item._id}`, {
        method: "PATCH",
        body: {
          subject: item.subject,
          message: item.message,
          expiresAt: item.expiresAt,
          published: !item.published,
        },
      });
      onMessage({ text: `Announcement ${item.published ? "deactivated" : "published"}.`, error: false });
      await onSent();
    } catch (error) {
      onMessage({ text: error.message, error: true });
    } finally {
      setAnnouncementBusy(false);
    }
  }

  return (
    <section className="notification-layout admin-section">
      <div className="panel">
        <div className="panel-heading"><div><p className="eyebrow">STUDENT ANNOUNCEMENT</p><h2>Send meal notification</h2><p>Emails go to active student accounts only. Recipients are handled individually and never exposed to one another.</p></div></div>
        <form className="email-form" onSubmit={submit}>
          <label htmlFor="email-subject">Subject</label>
          <input id="email-subject" name="subject" maxLength="160" required value={emailSubject} onChange={(event) => { setEmailSubject(event.target.value); startNewEmailRequest(); }} />
          <label htmlFor="email-message">Message</label>
          <textarea id="email-message" name="message" rows="9" maxLength="10000" required value={emailMessage} onChange={(event) => { setEmailMessage(event.target.value); startNewEmailRequest(); }} />
          <label htmlFor="email-recipient-mode">Recipients</label>
          <select id="email-recipient-mode" value={recipientMode} onChange={(event) => { setRecipientMode(event.target.value); startNewEmailRequest(); }}>
            <option value="all">Send to All Approved Students</option>
            <option value="selected">Send to Selected Students</option>
          </select>
          {recipientMode === "selected" && (
            <label htmlFor="email-selected-recipients">Select students (Ctrl/Cmd-click for multiple)
              <select id="email-selected-recipients" multiple size="6" value={selectedRecipients} onChange={(event) => { setSelectedRecipients(Array.from(event.target.selectedOptions, (option) => option.value)); startNewEmailRequest(); }}>
                {recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.rollNumber} · {recipient.email}</option>)}
              </select>
            </label>
          )}
          <details className="email-preview"><summary>Preview Email</summary><p><strong>{emailSubject || "Email subject"}</strong></p><pre>{emailMessage || "Email message"}</pre></details>
          <button className="button button-primary" type="submit" disabled={sending || !recipients.length || (recipientMode === "selected" && !selectedRecipients.length)}>{sending ? "Sending…" : recipientMode === "all" ? "Send to All Approved Students" : "Send to Selected Students"}</button>
        </form>
        {result && <div className="delivery-result" role="status">
          <p>Mail transport status: {result.deliveryStatus}. Total approved students: {result.totalApprovedStudents}; registered email addresses: {result.registeredEmailAddresses}; successfully accepted: {result.sentCount}; failed: {result.failedCount}; skipped: {result.skippedCount}. SMTP acceptance does not confirm inbox delivery.</p>
          {result.emailResults?.some((item) => item.status === "failed") && <ul>{result.emailResults.filter((item) => item.status === "failed").map((item) => <li key={item.email}>{item.email}: {item.errorReason || item.errorCode || "Sending failed"}</li>)}</ul>}
        </div>}
        <div className="announcement-editor">
          <div className="panel-heading"><div><p className="eyebrow">IN-APP + EMAIL FOR STUDENTS</p><h2>{announcementId ? "Edit announcement" : "Publish announcement"}</h2><p>Publishing creates in-app notifications and independently emails registered, approved, active recipients. SMTP acceptance does not confirm inbox delivery.</p></div></div>
          <form className="email-form" onSubmit={saveAnnouncement}>
            <label htmlFor="announcement-subject">Subject</label>
            <input id="announcement-subject" maxLength="160" required value={announcementSubject} onChange={(event) => setAnnouncementSubject(event.target.value)} />
            <label htmlFor="announcement-message">Message</label>
            <textarea id="announcement-message" rows="5" maxLength="10000" required value={announcementMessage} onChange={(event) => setAnnouncementMessage(event.target.value)} />
            {!announcementId && <>
              <label htmlFor="announcement-recipient-mode">Announcement recipients</label>
              <select id="announcement-recipient-mode" value={recipientMode} onChange={(event) => setRecipientMode(event.target.value)}>
                <option value="all">All approved and active registered students</option>
                <option value="selected">Selected students</option>
              </select>
              {recipientMode === "selected" && (
                <label htmlFor="announcement-selected-recipients">Select students
                  <select id="announcement-selected-recipients" multiple size="6" value={selectedRecipients} onChange={(event) => setSelectedRecipients(Array.from(event.target.selectedOptions, (option) => option.value))}>
                    {recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.rollNumber} · {recipient.email}</option>)}
                  </select>
                </label>
              )}
            </>}
            <label htmlFor="announcement-expiry">Expiry (optional)</label>
            <input id="announcement-expiry" type="datetime-local" value={announcementExpiry} onChange={(event) => setAnnouncementExpiry(event.target.value)} />
            <div className="button-row">
              <button className="button button-primary" type="submit" disabled={announcementBusy || (!announcementId && recipientMode === "selected" && !selectedRecipients.length)}>{announcementBusy ? "Publishing…" : announcementId ? "Save announcement" : "Publish announcement"}</button>
              {announcementId && <button className="button button-outline" type="button" onClick={() => { setAnnouncementId(""); setAnnouncementSubject(""); setAnnouncementMessage(""); setAnnouncementExpiry(""); }}>Cancel edit</button>}
            </div>
          </form>
          {announcementResult && <div className="delivery-result" role="status">
            <strong>Announcement published successfully.</strong>
            <p>In-app notifications: {announcementResult.inAppNotificationsCreated} created.</p>
            <p>Emails accepted: {announcementResult.emailsAccepted}. Emails failed: {announcementResult.emailsFailed}. Recipients skipped: {announcementResult.recipientsSkipped}.</p>
            <small>Email status: {announcementResult.emailStatus}. SMTP acceptance is not confirmation of inbox delivery.</small>
          </div>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading"><div><p className="eyebrow">IN-APP HISTORY</p><h2>Recent notifications</h2></div></div>
        <div className="notification-list">
          {notifications.map((notification) => (
            <article className="notification-item" key={notification._id}>
              <div><h3>{notification.subject}</h3><p>{notification.message}</p><small>{notification.kind === "announcement" ? `Student announcement · ${notification.published ? "Published" : "Inactive"}${notification.expiresAt ? ` · expires ${new Date(notification.expiresAt).toLocaleString()}` : ""}` : "Email notification"}</small>
                {notification.kind === "announcement" && <small className="announcement-delivery-meta">In-app: {notification.inAppStatus === "created" ? `${notification.inAppCount} created` : "Failed"} · Email: {notification.deliveryStatus} · {notification.sentCount} accepted · {notification.failedCount} failed · {notification.skippedCount} skipped</small>}
              </div>
              <div className="notification-meta">{notification.kind === "announcement" ? <><button className="table-action" type="button" disabled={announcementBusy} onClick={() => editAnnouncement(notification)}>Edit</button><button className="table-action" type="button" disabled={announcementBusy} onClick={() => toggleAnnouncement(notification)}>{notification.published ? "Deactivate" : "Publish"}</button>{notification.failedCount > 0 && <button className="table-action" type="button" disabled={announcementBusy} onClick={() => retryAnnouncementEmails(notification)}>{announcementBusy ? "Retrying…" : "Retry Failed Emails"}</button>}</> : <><span className={`delivery-badge ${notification.deliveryStatus}`}>{notification.deliveryStatus}</span><span>{notification.sentCount}/{notification.recipientCount} sent</span></>}<time>{new Date(notification.createdAt).toLocaleString()}</time></div>
            </article>
          ))}
          {!notifications.length && <p className="empty-notifications">No notifications or announcements yet.</p>}
        </div>
      </div>
    </section>
  );
}
