# node7-crafting-ui

Universal full-screen crafting UI shell for the NODE7 RedM framework.

## v1.4.0 UI features

- Large active-craft progress display with percent and remaining time.
- Queue item images, quantities, status states, progress bars, and optional cancel action.
- `ALL / CRAFTABLE / LOCKED` recipe filters.
- `MAX` quantity button and max-craftable display.
- Ingredient availability meters.
- Optional generic requirements/tool/station display.
- READY / LOADING / CRAFTING station status.
- Optional loading overlay while a calling resource refreshes recipe data.
- Arrow/WASD recipe navigation, Q/E category cycling, Enter to craft, ESC to close.
- Stable recipe selection: selecting a card does not rebuild the recipe grid or reload all inventory images.
- Shared `node7-inventory/html/images/` support remains the default image source.

This resource is UI-only. It does **not** contain crafting recipes, inventory logic, jobs, gangs, server-side item validation, item removal, rewards, crafting stations, props, or animations. Calling resources provide data and handle gameplay logic.

## Install

Place the folder in your NODE7 UI resources and add:

```cfg
exec @node7-crafting-ui/permissions.cfg
ensure node7-crafting-ui
```

The resource has no framework dependency and can start independently.

## ACE test command

Default command:

```text
/craftingtest
```

Permission object:

```text
node7.craftingui.test
```

The supplied `permissions.cfg` grants the test to:

- `group.node7_admin`
- `group.node7_owner`
- `group.admin`

The test command opens a full-screen demo and simulates UI progress only. It does not add/remove inventory items.

## Client exports

### Open

```lua
exports['node7-crafting-ui']:Open({
    title = 'Crafting',
    subtitle = 'Available Recipes',
    station = 'Blacksmith',
    location = 'Valentine',

    context = {
        stationId = 'blacksmith_valentine'
    },

    categories = {
        { id = 'all', label = 'All Recipes' },
        { id = 'materials', label = 'Materials' }
    },

    recipes = {
        {
            id = 'iron_ingot',
            label = 'Iron Ingot',
            category = 'materials',
            description = 'Refined iron.',
            output = 1,
            duration = 3500,
            icon = 'II',
            ingredients = {
                { item = 'iron_ore', label = 'Iron Ore', required = 3, owned = 8 },
                { item = 'coal', label = 'Coal', required = 1, owned = 4 }
            }
        }
    }
})
```

Optional `image` can be supplied on a recipe instead of `icon`.

### Close

```lua
exports['node7-crafting-ui']:Close()
```

### Update

```lua
exports['node7-crafting-ui']:Update({
    recipes = updatedRecipes
})
```

### Update inventory counts

```lua
exports['node7-crafting-ui']:SetInventory({
    iron_ore = 12,
    coal = 5
})
```

### Queue

```lua
exports['node7-crafting-ui']:SetQueue({
    {
        id = 'craft_1',
        recipeId = 'iron_ingot',
        label = 'Iron Ingot',
        item = 'iron_ingot',
        quantity = 2,
        duration = 7000,
        status = 'crafting',
        progress = 0,
        cancellable = true
    }
})
```

### Progress

```lua
exports['node7-crafting-ui']:SetProgress({
    id = 'craft_1',
    recipeId = 'iron_ingot',
    label = 'Iron Ingot',
    item = 'iron_ingot',
    quantity = 2,
    duration = 7000,
    remainingMs = 3150,
    status = 'crafting',
    progress = 55
})
```

### Busy state

```lua
exports['node7-crafting-ui']:SetBusy(true, 'CRAFTING')
exports['node7-crafting-ui']:SetBusy(false)
```

### Loading state

```lua
exports['node7-crafting-ui']:SetLoading(true, 'LOADING RECIPES')
-- refresh recipe data...
exports['node7-crafting-ui']:SetLoading(false)
```

### Toast

```lua
exports['node7-crafting-ui']:Notify('Craft complete.', 'success')
```

Kinds: `info`, `success`, `warning`, `error`.

## UI actions back to the calling resource

When opened through an export, NODE7 remembers the calling resource and sends UI actions back to:

```text
<calling-resource>:node7CraftingUiAction
```

Example:

```lua
AddEventHandler('my-crafting-resource:node7CraftingUiAction', function(action, data, context)
    if action == 'craft' then
        print(data.recipeId, data.quantity)
    elseif action == 'close' then
        -- clean up local station state
    end
end)
```

Actions:

- `selectRecipe`
- `selectCategory`
- `changeQuantity`
- `craft`
- `cancelCraft` (only emitted when a queue entry sets `cancellable = true`)
- `close`

A custom local event can be supplied with `actionEvent = 'my-resource:craftingAction'`.

The UI intentionally sends only user intent. The calling crafting resource must validate recipes, distance, ingredients, permissions and rewards on the server.

## Client events

The same display functions are available through:

```text
node7-crafting-ui:client:open
node7-crafting-ui:client:close
node7-crafting-ui:client:update
node7-crafting-ui:client:setProgress
node7-crafting-ui:client:setQueue
node7-crafting-ui:client:setInventory
node7-crafting-ui:client:setBusy
node7-crafting-ui:client:setLoading
node7-crafting-ui:client:notify
```

## Recipe fields

Supported recipe presentation fields:

```text
id
item
label / name
category
categoryLabel
description
output
duration
icon
image
rarity
ingredients
maxCraftable
maxQuantity
requirements
tool
stationRequirement
locked
lockReason
```

Ingredient presentation fields:

```text
item
label / name
required / amount
owned
```

All server-authoritative crafting behaviour belongs in the resource using this UI.


## v1.3.0 - Dark Red Dead theme + shared inventory images

- Darker black/brown/red frontier palette with reduced bright gold.
- Recipe and ingredient images resolve directly from `node7-inventory/html/images/`.
- No images are copied into this resource.
- `item = "bread"` resolves to the inventory image `bread.png`.
- `image = "bread.png"` resolves to the same shared inventory directory.
- `image = "node7-inventory/html/images/bread.png"` is also accepted.
- Full external/data URLs remain supported when explicitly supplied.
- Missing images fall back to the supplied text icon without breaking the UI.

### Shared image payload examples

```lua
-- Item name: resolves image through Node7 Core shared item metadata first,
-- then the DUI falls back to node7-inventory/html/images/<item>.png.
{
    item = 'bread',
    label = 'Bread'
}

-- Exact inventory image filename.
{
    item = 'haysnack',
    image = 'hay_cube.png',
    label = 'Hay Snack'
}

-- Exact inventory path is accepted too.
{
    item = 'bread',
    image = 'node7-inventory/html/images/bread.png'
}
```

Optional per-open override:

```lua
imageConfig = {
    enabled = true,
    resource = 'node7-inventory',
    path = 'html/images',
    extension = 'png'
}
```


## v1.3.1 UI click stability

- Recipe selection updates in place instead of rebuilding every recipe card.
- Inventory item images are not re-created on ordinary recipe selection or quantity changes.
- Removed selected-card pulse/scale rendering effects.
- Removed GPU-heavy image filters/drop shadows that could flicker in RedM CEF.
- Opening/closing and ambient UI animation remain; normal UI clicks are intentionally stable.
- No crafting/inventory/server logic was added.
