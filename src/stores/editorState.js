/**
 * Transient state passed from Foods page to Food/Meal editors.
 * Uses a mutable object so imports can be reassigned across modules.
 */
export const editorState = {
  foodPrefill:    null,
  foodStore:      'foodList',
  foodDiaryCtx:   null,
  mealPrefill:    null,
  mealIsRecipe:   false,
  lastMealAdded:  null,  // meal index to scroll to after adding food
  diaryScrollY:   null,  // scroll position to restore when returning to Diary after adding food
  foodsScrollY:   null,  // scroll position to restore when returning to Foods
  foodsActiveTab: null,  // tab index to restore when returning to Foods
  foodsSearch:    null,  // Foods search text to restore when returning to Foods
  foodSaved:      null,  // the food FoodEditor last saved, for the page that opened it
  qtyReturn:      null,  // Foods quantity sheet to reopen after "Edit nutrition"
  diaryEditReturn: null, // Diary item sheet to reopen after "Edit nutrition"
};

export function clearFoodEditorState() {
  editorState.foodPrefill   = null;
  editorState.foodStore     = 'foodList';
  editorState.foodDiaryCtx  = null;
}

export function clearMealEditorState() {
  editorState.mealPrefill  = null;
  editorState.mealIsRecipe = false;
}
