local RESOURCE = GetCurrentResourceName()

local uiOpen = false
local ownerResource = nil
local actionEvent = nil
local uiContext = {}
local testMode = false
local testCraftRunning = false

local sharedItems = nil

local function getSharedItems()
    if type(sharedItems) == 'table' then
        return sharedItems
    end

    if GetResourceState('node7-core') ~= 'started' then
        return nil
    end

    local ok, items = pcall(function()
        return exports['node7-core']:GetShared('Items')
    end)

    if ok and type(items) == 'table' then
        sharedItems = items
        return sharedItems
    end

    return nil
end

local function resolveSharedImage(entry)
    if type(entry) ~= 'table' or (type(entry.image) == 'string' and entry.image ~= '') then
        return
    end

    local itemName = type(entry.item) == 'string' and entry.item:lower() or nil
    if not itemName or itemName == '' then
        return
    end

    local items = getSharedItems()
    local item = items and items[itemName] or nil
    if item and type(item.image) == 'string' and item.image ~= '' then
        entry.image = item.image
    end
end

local function enrichPayloadImages(payload)
    if type(payload) ~= 'table' then
        return payload
    end

    if payload.imageConfig == nil then
        payload.imageConfig = {
            enabled = true,
            resource = 'node7-inventory',
            path = 'html/images',
            extension = 'png'
        }
    end

    if type(payload.recipes) == 'table' then
        for i = 1, #payload.recipes do
            local recipe = payload.recipes[i]
            if type(recipe) == 'table' then
                resolveSharedImage(recipe)

                if type(recipe.ingredients) == 'table' then
                    for j = 1, #recipe.ingredients do
                        resolveSharedImage(recipe.ingredients[j])
                    end
                end
            end
        end
    end

    if type(payload.queue) == 'table' then
        for i = 1, #payload.queue do
            resolveSharedImage(payload.queue[i])
        end
    end

    if type(payload.activeProgress) == 'table' then
        resolveSharedImage(payload.activeProgress)
    end

    return payload
end

local function enrichQueueImages(queue)
    if type(queue) ~= 'table' then
        return {}
    end

    for i = 1, #queue do
        resolveSharedImage(queue[i])
    end

    return queue
end


local allowedActions = {
    close = true,
    selectRecipe = true,
    selectCategory = true,
    changeQuantity = true,
    craft = true,
    cancelCraft = true
}

local function debugPrint(message)
    if Config.Debug then
        print(('[%s] %s'):format(RESOURCE, tostring(message)))
    end
end

local function validEventName(value)
    return type(value) == 'string'
        and #value > 0
        and #value <= 128
        and value:match('^[%w_:%-%.]+$') ~= nil
end

local function normalizeOwner(value)
    if type(value) ~= 'string' or value == '' then
        return nil
    end

    if value:match('^[%w_%-]+$') then
        return value
    end

    return nil
end

local function closeUi(silent)
    if not uiOpen then
        SetNuiFocus(false, false)
        return
    end

    uiOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })

    if not silent then
        local packet = {
            action = 'close',
            data = {},
            context = uiContext,
            owner = ownerResource
        }

        TriggerEvent('node7-crafting-ui:client:action', packet)

        if actionEvent and validEventName(actionEvent) then
            TriggerEvent(actionEvent, 'close', {}, uiContext)
        elseif ownerResource then
            TriggerEvent(('%s:node7CraftingUiAction'):format(ownerResource), 'close', {}, uiContext)
        end
    end

    ownerResource = nil
    actionEvent = nil
    uiContext = {}
    testMode = false
    testCraftRunning = false
end

local function openUi(payload, explicitOwner)
    if type(payload) ~= 'table' then
        debugPrint('Open ignored: payload was not a table.')
        return false
    end

    local invoking = GetInvokingResource()
    ownerResource = normalizeOwner(explicitOwner)
        or normalizeOwner(invoking)
        or normalizeOwner(payload.ownerResource)

    actionEvent = validEventName(payload.actionEvent) and payload.actionEvent or nil
    uiContext = type(payload.context) == 'table' and payload.context or {}
    testMode = payload.testMode == true
    testCraftRunning = false

    payload = enrichPayloadImages(payload)

    if payload.maxQuantity == nil then
        payload.maxQuantity = Config.DefaultMaxQuantity
    end

    if payload.closeOnEscape == nil then
        payload.closeOnEscape = Config.CloseOnEscape
    end

    uiOpen = true
    SetNuiFocus(true, true)

    SendNUIMessage({
        action = 'open',
        payload = payload
    })

    return true
end

local function updateUi(payload)
    if not uiOpen or type(payload) ~= 'table' then
        return false
    end

    payload = enrichPayloadImages(payload)

    SendNUIMessage({
        action = 'update',
        payload = payload
    })

    return true
end

local function setProgress(payload)
    if not uiOpen then
        return false
    end

    local data = type(payload) == 'table' and payload or {}
    resolveSharedImage(data)

    SendNUIMessage({
        action = 'progress',
        payload = data
    })

    return true
end

local function setQueue(payload)
    if not uiOpen then
        return false
    end

    SendNUIMessage({
        action = 'queue',
        payload = enrichQueueImages(payload)
    })

    return true
end

local function setInventory(payload)
    if not uiOpen then
        return false
    end

    SendNUIMessage({
        action = 'inventory',
        payload = type(payload) == 'table' and payload or {}
    })

    return true
end

local function setBusy(value, text)
    if not uiOpen then
        return false
    end

    SendNUIMessage({
        action = 'busy',
        payload = {
            busy = value == true,
            text = type(text) == 'string' and text or nil
        }
    })

    return true
end

local function setLoading(value, text)
    if not uiOpen then
        return false
    end

    SendNUIMessage({
        action = 'loading',
        payload = {
            loading = value == true,
            text = type(text) == 'string' and text or nil
        }
    })

    return true
end

local function notify(message, kind)
    if not uiOpen then
        return false
    end

    SendNUIMessage({
        action = 'notify',
        payload = {
            message = tostring(message or ''),
            kind = kind or 'info'
        }
    })

    return true
end

local function buildTestPayload()
    return {
        testMode = true,
        title = 'CRAFTING',
        subtitle = 'Universal Workbench',
        station = 'NODE7 TEST BENCH',
        location = 'Valentine',
        maxQuantity = 25,
        context = {
            test = true,
            stationId = 'node7_test_bench'
        },
        categories = {
            { id = 'all', label = 'All Recipes' },
            { id = 'weapons', label = 'Weapons' },
            { id = 'ammo', label = 'Ammunition' },
            { id = 'campfire', label = 'Campfire' },
            { id = 'medicine', label = 'Medicine' },
            { id = 'materials', label = 'Materials' }
        },
        recipes = {
            {
                id = 'improved_sights',
                item = 'improved_sights',
                label = 'Improved Rifle Sights',
                category = 'weapons',
                description = 'Precision-machined sight components prepared for compatible long guns.',
                output = 1,
                duration = 4200,
                icon = 'IS',
                rarity = 'Fine',
                maxCraftable = 3,
                requirements = {
                    { label = 'Precision Tools', value = 'Available', met = true },
                    { label = 'Workbench', value = 'Required', met = true }
                },
                ingredients = {
                    { item = 'iron_ingot', label = 'Iron Ingot', required = 2, owned = 8 },
                    { item = 'steel_ingot', label = 'Steel Ingot', required = 1, owned = 4 },
                    { item = 'screws', label = 'Screws', required = 2, owned = 6 }
                }
            },
            {
                id = 'weapon_oil',
                item = 'gun_oil',
                label = 'Gun Oil',
                category = 'weapons',
                description = 'A small bottle of cleaning oil for maintaining firearm components.',
                output = 1,
                duration = 2500,
                icon = 'WO',
                rarity = 'Common',
                ingredients = {
                    { item = 'animal_fat', label = 'Rendered Fat', required = 1, owned = 5 },
                    { item = 'glass_bottle', label = 'Glass Bottle', required = 1, owned = 3 }
                }
            },
            {
                id = 'repeater_ammo',
                item = 'ammo_repeater',
                label = 'Repeater Cartridges',
                category = 'ammo',
                description = 'A prepared bundle of repeater cartridges.',
                output = 12,
                duration = 3600,
                icon = 'RC',
                rarity = 'Common',
                ingredients = {
                    { item = 'brass_casing', label = 'Brass Casings', required = 2, owned = 12 },
                    { item = 'gunpowder', label = 'Gunpowder', required = 2, owned = 8 }
                }
            },
            {
                id = 'express_rifle_ammo',
                item = 'ammo_rifle_express',
                label = 'Express Rifle Ammo',
                category = 'ammo',
                description = 'Higher-grade rifle ammunition requiring additional powder and prepared casings.',
                output = 10,
                duration = 4800,
                icon = 'EA',
                rarity = 'Fine',
                ingredients = {
                    { item = 'brass_casing', label = 'Brass Casings', required = 3, owned = 12 },
                    { item = 'gunpowder', label = 'Gunpowder', required = 3, owned = 8 },
                    { item = 'bullet_lead', label = 'Bullet Lead', required = 2, owned = 5 }
                }
            },
            {
                id = 'cooked_venison',
                item = 'venison_steak',
                label = 'Venison Steak',
                category = 'campfire',
                description = 'Fresh venison cooked over an open flame.',
                output = 1,
                duration = 3000,
                icon = 'CV',
                rarity = 'Common',
                ingredients = {
                    { item = 'raw_venison', label = 'Raw Venison', required = 1, owned = 6 },
                    { item = 'salt', label = 'Salt', required = 1, owned = 11 }
                }
            },
            {
                id = 'camp_coffee',
                item = 'camp_coffee',
                label = 'Camp Coffee',
                category = 'campfire',
                description = 'Strong camp coffee brewed for the trail.',
                output = 1,
                duration = 2200,
                icon = 'CC',
                rarity = 'Common',
                ingredients = {
                    { item = 'coffee_beans', label = 'Coffee Beans', required = 1, owned = 7 },
                    { item = 'water', label = 'Water', required = 1, owned = 9 }
                }
            },
            {
                id = 'health_tonic',
                label = 'Health Tonic',
                category = 'medicine',
                description = 'A prepared tonic using common medicinal herbs.',
                output = 1,
                duration = 5200,
                icon = 'HT',
                rarity = 'Fine',
                ingredients = {
                    { item = 'yarrow', label = 'Yarrow', required = 2, owned = 5 },
                    { item = 'ginseng', label = 'Ginseng', required = 1, owned = 1 },
                    { item = 'glass_bottle', label = 'Glass Bottle', required = 1, owned = 3 }
                }
            },
            {
                id = 'snake_oil',
                label = 'Snake Oil',
                category = 'medicine',
                description = 'A restorative tonic prepared from gathered ingredients.',
                output = 1,
                duration = 4600,
                icon = 'SO',
                rarity = 'Common',
                ingredients = {
                    { item = 'indian_tobacco', label = 'Indian Tobacco', required = 2, owned = 4 },
                    { item = 'water', label = 'Water', required = 1, owned = 9 }
                }
            },
            {
                id = 'iron_ingot',
                item = 'iron_ingot',
                label = 'Iron Ingot',
                category = 'materials',
                description = 'Refined iron suitable for use by other crafting systems.',
                output = 1,
                duration = 3900,
                icon = 'II',
                rarity = 'Material',
                ingredients = {
                    { item = 'iron_ore', label = 'Iron Ore', required = 3, owned = 13 },
                    { item = 'coal', label = 'Coal', required = 1, owned = 5 }
                }
            },
            {
                id = 'leather_strip',
                item = 'tanned_leather',
                label = 'Leather Strip',
                category = 'materials',
                description = 'Cut and prepared leather for general crafting.',
                output = 2,
                duration = 1800,
                icon = 'LS',
                rarity = 'Material',
                ingredients = {
                    { item = 'leather', label = 'Leather', required = 1, owned = 8 }
                }
            },
            {
                id = 'reinforced_plate',
                label = 'Reinforced Plate',
                category = 'materials',
                description = 'A heavy plate requiring more material than the test inventory currently holds.',
                output = 1,
                duration = 6000,
                icon = 'RP',
                rarity = 'Rare',
                ingredients = {
                    { item = 'steel_ingot', label = 'Steel Ingot', required = 5, owned = 4 },
                    { item = 'coal', label = 'Coal', required = 2, owned = 5 }
                }
            },
            {
                id = 'locked_example',
                label = 'Locked Recipe Example',
                category = 'weapons',
                description = 'Demonstrates a disabled recipe state supplied by the calling crafting resource.',
                output = 1,
                duration = 5000,
                icon = 'LK',
                rarity = 'Locked',
                locked = true,
                lockReason = 'Recipe unavailable',
                ingredients = {
                    { item = 'iron_ingot', label = 'Iron Ingot', required = 1, owned = 8 }
                }
            }
        },
        queue = {}
    }
end

local function runTestCraft(data)
    if testCraftRunning or not uiOpen then
        notify('A test craft is already running.', 'warning')
        return
    end

    local recipeId = type(data) == 'table' and data.recipeId or 'test_recipe'
    local label = type(data) == 'table' and data.label or 'Selected Recipe'
    local quantity = math.max(1, tonumber(type(data) == 'table' and data.quantity) or 1)
    local duration = math.max(1200, tonumber(type(data) == 'table' and data.duration) or 3000)
    local itemName = type(data) == 'table' and data.item or nil
    local image = type(data) == 'table' and data.image or nil
    local output = math.max(1, tonumber(type(data) == 'table' and data.output) or 1)

    testCraftRunning = true
    setBusy(true, 'CRAFTING')

    local queueId = ('test_%d'):format(GetGameTimer())
    local queue = {
        {
            id = queueId,
            recipeId = recipeId,
            label = label,
            item = itemName,
            image = image,
            quantity = quantity,
            output = output,
            duration = duration,
            cancellable = true,
            status = 'crafting',
            progress = 0
        }
    }

    setQueue(queue)

    CreateThread(function()
        local started = GetGameTimer()

        while uiOpen and testCraftRunning do
            local elapsed = GetGameTimer() - started
            local progress = math.min(100, math.floor((elapsed / duration) * 100))

            setProgress({
                id = queueId,
                recipeId = recipeId,
                label = label,
                item = itemName,
                image = image,
                quantity = quantity,
                output = output,
                duration = duration,
                remainingMs = math.max(0, duration - elapsed),
                progress = progress,
                status = progress >= 100 and 'complete' or 'crafting'
            })

            if progress >= 100 then
                break
            end

            Wait(100)
        end

        if uiOpen and testCraftRunning then
            setBusy(false)
            notify(('UI test complete: %sx %s'):format(quantity, label), 'success')
            Wait(500)
            setQueue({})
        end

        testCraftRunning = false
    end)
end

RegisterNUICallback('uiAction', function(data, cb)
    if type(data) ~= 'table' then
        cb({ ok = false, error = 'invalid_payload' })
        return
    end

    local action = tostring(data.action or '')
    local actionData = type(data.data) == 'table' and data.data or {}

    if not allowedActions[action] then
        cb({ ok = false, error = 'invalid_action' })
        return
    end

    if action == 'close' then
        closeUi(false)
        cb({ ok = true })
        return
    end

    local packet = {
        action = action,
        data = actionData,
        context = uiContext,
        owner = ownerResource
    }

    TriggerEvent('node7-crafting-ui:client:action', packet)

    if actionEvent and validEventName(actionEvent) then
        TriggerEvent(actionEvent, action, actionData, uiContext)
    elseif ownerResource and ownerResource ~= RESOURCE then
        TriggerEvent(('%s:node7CraftingUiAction'):format(ownerResource), action, actionData, uiContext)
    end

    if testMode and action == 'craft' then
        runTestCraft(actionData)
    elseif testMode and action == 'cancelCraft' then
        testCraftRunning = false
        setBusy(false)
        setQueue({})
        notify('UI test craft cancelled.', 'warning')
    end

    cb({ ok = true })
end)

RegisterNetEvent('node7-crafting-ui:client:open', function(payload)
    openUi(payload, type(payload) == 'table' and payload.ownerResource or nil)
end)

RegisterNetEvent('node7-crafting-ui:client:close', function()
    closeUi(true)
end)

RegisterNetEvent('node7-crafting-ui:client:update', function(payload)
    updateUi(payload)
end)

RegisterNetEvent('node7-crafting-ui:client:setProgress', function(payload)
    setProgress(payload)
end)

RegisterNetEvent('node7-crafting-ui:client:setQueue', function(payload)
    setQueue(payload)
end)

RegisterNetEvent('node7-crafting-ui:client:setInventory', function(payload)
    setInventory(payload)
end)

RegisterNetEvent('node7-crafting-ui:client:setBusy', function(value, text)
    setBusy(value, text)
end)

RegisterNetEvent('node7-crafting-ui:client:setLoading', function(value, text)
    setLoading(value, text)
end)

RegisterNetEvent('node7-crafting-ui:client:notify', function(message, kind)
    notify(message, kind)
end)

RegisterNetEvent('node7-crafting-ui:client:openTest', function()
    openUi(buildTestPayload(), RESOURCE)
end)

RegisterNetEvent('node7-crafting-ui:client:testDenied', function(ace)
    local message = ('Access denied. Missing ACE: %s'):format(tostring(ace or Config.TestAce))
    print(('[%s] %s'):format(RESOURCE, message))

    TriggerEvent('chat:addMessage', {
        args = { 'NODE7', message }
    })
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName == RESOURCE then
        SetNuiFocus(false, false)
    end
end)

exports('Open', function(payload)
    return openUi(payload, GetInvokingResource())
end)

exports('Close', function()
    closeUi(true)
    return true
end)

exports('Update', updateUi)
exports('SetProgress', setProgress)
exports('SetQueue', setQueue)
exports('SetInventory', setInventory)
exports('SetBusy', setBusy)
exports('SetLoading', setLoading)
exports('Notify', notify)
exports('IsOpen', function()
    return uiOpen
end)
