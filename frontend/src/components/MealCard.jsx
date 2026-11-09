const mealDetails = {
  breakfast: { kicker: "START YOUR DAY", icon: "☀" },
  lunch: { kicker: "MIDDAY MEAL", icon: "◒" },
  teaTime: { kicker: "EVENING REFRESHMENT", icon: "☕" },
  dinner: { kicker: "END THE DAY WELL", icon: "☾" },
};

const mealTypeLabels = {
  veg: "VEG",
  nonVeg: "NON-VEG",
};

function ChoiceStatus({ choice }) {
  const status = choice?.status || "not-selected";
  const label =
    status === "eat"
      ? `Eating${choice.mealType ? ` · ${mealTypeLabels[choice.mealType]}` : " · Choose food preference"}`
      : status === "skip"
        ? "Skipping"
        : "Not selected";
  return <span className={`meal-status status-${status}`}>{label}</span>;
}

export default function MealCard({ mealName, menu, choice, timing, saving, onChoose, isSpecial = false }) {
  const { kicker, icon } = mealDetails[mealName];
  const availableTypes = ["veg", "nonVeg"].filter(
    (type) => menu?.[type]?.length
  );
  const currentChoice = choice || { status: "not-selected", mealType: null };
  const mealLabel = mealName === "teaTime"
    ? "Tea / Snacks"
    : mealName[0].toUpperCase() + mealName.slice(1);

  function chooseStatus(status) {
    const mealType = status === "eat"
      ? availableTypes.length === 1
        ? availableTypes[0]
        : availableTypes.includes(currentChoice.mealType)
          ? currentChoice.mealType
          : null
      : null;
    onChoose(mealName, status, mealType);
  }

  return (
    <article className="meal-card" style={{ "--card-index": Object.keys(mealDetails).indexOf(mealName) }}>
      <div className="meal-card-heading">
        <span className="meal-icon" aria-hidden="true">{icon}</span>
        <div><p className="meal-kicker">{kicker}</p><h2>{mealLabel}</h2></div>
        <ChoiceStatus choice={currentChoice} />
      </div>
      {timing && <p className="meal-timing">{timing}</p>}
      <div className={`menu-options${isSpecial ? " special-menu-options" : ""}`}>
        {isSpecial && <span className="special-menu-badge">SPECIAL MENU</span>}
        {[
          ["veg", "Vegetarian"],
          ["nonVeg", "Non-vegetarian"],
        ].filter(([type]) => availableTypes.includes(type)).map(([type, label]) => (
          <section key={type}>
            <h3><span className={`diet-dot ${type}`} />{label}</h3>
            <ul className="menu-list">
              {menu[type].map((item, index) => (
                <li key={`${type}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        {!availableTypes.length && <p className="muted menu-unavailable">Menu not added yet. Please check back later.</p>}
      </div>
      <div className="choice-controls">
        <p className="choice-group-label">Your selection</p>
        <div className="choice-actions">
          <button
            className={`choice-button eat-button${currentChoice.status === "eat" ? " selected" : ""}`}
            type="button"
            aria-pressed={currentChoice.status === "eat"}
            disabled={saving || !availableTypes.length}
            onClick={() => chooseStatus("eat")}
          >
            I will eat
          </button>
          <button
            className={`choice-button skip-button${currentChoice.status === "skip" ? " selected" : ""}`}
            type="button"
            aria-pressed={currentChoice.status === "skip"}
            disabled={saving}
            onClick={() => chooseStatus("skip")}
          >
            I will skip
          </button>
        </div>
        {availableTypes.length > 0 && (
          <fieldset className="food-preference-options" disabled={saving || currentChoice.status !== "eat"}>
            <legend>Food preference</legend>
            <div className="food-preference-buttons">
              {availableTypes.map((type) => (
                <button
                  className={`food-preference-button${currentChoice.mealType === type ? " selected" : ""}`}
                  type="button"
                  key={type}
                  aria-pressed={currentChoice.mealType === type}
                  onClick={() => onChoose(mealName, "eat", type)}
                >
                  <span aria-hidden="true">{currentChoice.mealType === type ? "✓ " : ""}</span>
                  {mealTypeLabels[type]}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </article>
  );
}
