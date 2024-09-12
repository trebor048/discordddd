/**
 * @name LastOffline
 * @description Allows you to see when someone went last offline.
 * @author davilarek, imafrogowo
 * @version 1.0.0
 */

const { Webpack } = BdApi;
const PresenceStore = Webpack.getStore('PresenceStore');
const UserStore = Webpack.getStore('UserStore');

class LastOnline {
  constructor() {
    this.name = LastOnline.name;
    this.presenceEventListener = null;
    this.patches = [];
    this.classes = {};
    // this.cache = BdApi.Data.load(this.name, "data") ?? {};
    this.cache = {};
    this.getStatusOfUser = BdApi.Webpack.getStore("PresenceStore").getStatus;
  }

  saveData(prop, val) {
    this.cache[prop] = val;
    // BdApi.Data.save(this.name, "data", this.cache);
    this._lastSaveTime = this._lastSaveTime ?? Date.now();
    if (Date.now() - this._lastSaveTime > 300000) // 5 mins
    // if (Date.now() - this._lastSaveTime > 10) // 10 ms
    {
      console.log(`%c[${this.name}]%c Saving data to file...`, "color: blue;", "color: initial;");
      BdApi.Data.save(this.name, "data", this.cache);
      this._lastSaveTime = Date.now();
    }
  }

  /**
   * @param {"after" | "before" | "instead"} patchType
   * @param {object} moduleToPatch
   * @param {string} functionName
   * @param {Function} callback
   */
  addPatch(patchType, moduleToPatch, functionName, callback) {
    this.patches.push(
      (BdApi.Patcher[patchType])(this.name, moduleToPatch, functionName, callback)
    );
  }

  start() {
    this.cache = BdApi.Data.load(this.name, "data") ?? {};
    this.classes["defCol1"] = BdApi.Webpack.getModule(x => x.defaultColor && x.tabularNumbers).defaultColor;
    this.classes["defCol2"] = BdApi.Webpack.getModule(x => x.defaultColor && !x.tabularNumbers && !x.error).defaultColor;
    this.usernameCreatorModuleGetter = (() => {
      const theString = `"User Tag"`;
      const theFilter = x2 => x2 && x2.toString?.().includes(theString);
      const theFilterMain = x => x && Object.values(x).some(theFilter);
      const theModule = BdApi.Webpack.getModule(theFilterMain);
      const funcName = Object.keys(theModule).find(prop => theFilter(theModule[prop]));
      return { funcName, theFunc: theModule[funcName], theModule };
    })();
    this.presenceEventListener = event => {
      const userId = event.updates[0].user.id;
      const status = event.updates[0].status;

      if (status === 'offline') {
        const user = UserStore.getUser(userId);

        if (user) {
          const a = {
            userId,
            user,
            newDate: new Date().getTime(),
          };
          this.saveData(userId, a);
        }
      }
    };

    BdApi.Webpack.getModule(e => e.dispatch && !e.emitter && !e.commands).subscribe("PRESENCE_UPDATES", this.presenceEventListener);
    const formatDateAndTime = (date) => {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const formattedDate = `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
      const formattedTime = date.toLocaleTimeString();
      return `${formattedDate} ${formattedTime}`;
    };

    const getUsernameProps = (lastTimeOnline, targetProps, userId) => [
      targetProps,
      BdApi.React.createElement(
        "h1",
        {
          style: {
            display: "inline-flex",
            marginLeft: '15px',
            fontSize: "17px",
            fontFamily: "Cosmic Sans, sans-serif",
          },
          className: `${this.classes["defCol1"]} ${this.classes["defCol2"]}`,
        },
        lastTimeOnline ? "Last Online: " + formatDateAndTime(new Date(lastTimeOnline)) : this.getStatusOfUser(userId)
      ),
    ];

    const usernameCreatorModule = this.usernameCreatorModuleGetter;

    this.addPatch("after", usernameCreatorModule.theModule, usernameCreatorModule.funcName, (_, args, ret) => {
      const { id: userId } = args[0]?.user || {};

      if (this.getStatusOfUser(userId) !== "offline") {
        return ret;
      }
      // if (this.getStatusOfUser(userId) == "offline")
      //   return ret;

      const { newDate } = this.cache[userId] || (this.cache[userId] = "None");
      const lastTimeOnline = newDate || this.cache[userId].newDate;

      const targetProps = ret.props.children.props.children[0].props.children.props.children[0].props.children;
      const modProps = getUsernameProps(lastTimeOnline, targetProps, userId);

      ret.props.children.props.children[0].props.children.props.children[0].props.children = modProps;

      return ret;
    });

    (async () => {
      this.secondUsernameCreatorModuleGetter = await (async () => {
        const theFilter1 = x => x && x.toString?.().includes("Messages.USER_PROFILE_MODAL") && x.toString?.().includes(".USER_INFO_CONNECTIONS");
        const theModule = await BdApi.Webpack.waitForModule(x2 => x2 && !x2.ensureModule && typeof x2 == 'object' && !x2.entries && !x2.exportTypedArrayStaticMethod && Object.values(x2).some(theFilter1));
        const funcName = Object.keys(theModule).filter(x => theFilter1(theModule[x]));
        return { funcName, theFunc: theModule[funcName], theModule };
      })();

      const secondUsernameCreatorModule = this.secondUsernameCreatorModuleGetter;

      this.addPatch("after", secondUsernameCreatorModule.theModule, secondUsernameCreatorModule.funcName, (_, args, ret) => {
        let unp = BdApi.Patcher.after(this.name, ret.props.children.props.children.props.children.props.children[1].props.children[1].props.children[0], "type", (_, args2, ret2) => {
          // console.log("patched successfully!", ret2, args2);
          const { id: userId } = args2[0]?.user || {};

          if (this.getStatusOfUser(userId) !== "offline") {
            return ret2;
          }
          // if (this.getStatusOfUser(userId) == "offline")
          //   return ret;

          const { newDate } = this.cache[userId] || (this.cache[userId] = "None");
          const lastTimeOnline = newDate || this.cache[userId].newDate;
          const targetProps = ret2.props.children[1].props.children[0].props.children;
          const modProps = getUsernameProps(lastTimeOnline, targetProps, userId);

          ret2.props.children[1].props.children[0].props.children = modProps;
          unp();
        });
      });
    })();
  }

  stop() {
    BdApi.Webpack.getModule(e => e.dispatch && !e.emitter && !e.commands).unsubscribe("PRESENCE_UPDATES", this.presenceEventListener);
    this.patches.forEach(x => x());
    BdApi.Data.save(this.name, "data", this.cache);
  }
}

module.exports = LastOnline;
