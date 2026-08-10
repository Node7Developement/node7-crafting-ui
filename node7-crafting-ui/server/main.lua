local RESOURCE = GetCurrentResourceName()

local function hasTestPermission(source)
    if source == 0 then
        return true
    end

    local commandAce = ('command.%s'):format(Config.TestCommand)

    return IsPlayerAceAllowed(source, Config.TestAce)
        or IsPlayerAceAllowed(source, commandAce)
        or IsPlayerAceAllowed(source, 'node7.admin')
        or IsPlayerAceAllowed(source, 'node7.owner')
end

RegisterCommand(Config.TestCommand, function(source)
    if source == 0 then
        print(('[%s] /%s must be run by an in-game player.'):format(RESOURCE, Config.TestCommand))
        return
    end

    if not hasTestPermission(source) then
        TriggerClientEvent('node7-crafting-ui:client:testDenied', source, Config.TestAce)
        return
    end

    TriggerClientEvent('node7-crafting-ui:client:openTest', source)
end, false)

exports('HasTestPermission', hasTestPermission)
