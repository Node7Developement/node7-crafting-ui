fx_version 'cerulean'
game 'rdr3'

rdr3_warning 'I acknowledge that this is a prerelease build of RedM, and I am aware my resources *will* become incompatible once RedM ships.'

lua54 'yes'

author 'NODE7 Development Studios'
description 'NODE7 universal full-screen crafting UI for RedM.'
version '1.4.0'

ui_page 'html/dui.html'

shared_script 'config.lua'

client_script 'client/main.lua'
server_script 'server/main.lua'

files {
    'html/dui.html',
    'html/dui.css',
    'html/dui.js'
}
