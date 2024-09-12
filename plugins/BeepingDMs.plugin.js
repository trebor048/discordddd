/**
 * @name BeepingDMs
 * @version 0.0.1
 * @description Discord will beep when you have DM :)
 * @author Kur0
 *
 */



module.exports = class BeepingDMs{

    load() { }
    start() {
var notBeeping = true
function checkDMs(){
    // do whatever you like here
	var DMcount = document.querySelectorAll('.listItemWrapper_dfb2f8').length

	if (DMcount > 3 && notBeeping == true){
		notBeeping = false;

		function beep(){
		var DMcount = document.querySelectorAll('.listItemWrapper_dfb2f8').length
		var list = Array.from(document.querySelectorAll('.listItemWrapper_dfb2f8'));
		require('electron').shell.beep()
		list.splice(list.length-2, 2)
		list.splice(0, 1);
		let name_list = []
		for (let i = 0; i < list.length; i++) {
			let name = list[i].querySelector("div > svg > foreignObject > div").getAttribute("aria-label")
			name_list.push(name)
		}
		if (name_list.length > 0){
		BdApi.showToast(`${name_list.join(" & ")} DM'd you!`)}
		if (DMcount > 3){
		setTimeout(beep, 3000);
		}else{
			notBeeping = true;
		}
		}
		beep();

	}

window.timer = setTimeout(checkDMs, 5000);}


checkDMs();
}
stop(){
clearInterval(window.timer);

}
}
