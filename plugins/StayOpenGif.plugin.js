/**
 * @name StayOpenGif
 * @description Keeps the GIF Drawer open, even after clicking elsewhere.
 * @version 1.2.5
 * @author LuckyCanucky
 * @authorLink https://betterdiscord.app/
 * @website https://betterdiscord.app/
 * @source https://betterdiscord.app/
 * @updateUrl https://betterdiscord.app/
 */


let drawer = document.querySelector("#app-mount > div.appAsidePanelWrapper-ev4hlp > div.notAppAsidePanel-3yzkgB > div:nth-child(3) > div > section > div")

drawer.removeEventListener(mousedown, handleMouseDown, true)
