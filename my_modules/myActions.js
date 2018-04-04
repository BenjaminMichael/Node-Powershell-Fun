const powershell = require('node-powershell');
const RemoveStore = require('./removeStore.js'); //redux datastore
const CompareStore = require('./compareStore.js'); //redux datastore
const { Set } = require('immutable');
const DOM = require('./DOMmanipulation.js'); //I use this module for most of the times I need to manipulate the user interface 
var Queue = require('better-queue');
const ipcRenderer = require('electron').ipcRenderer;
const log = (string) => ipcRenderer.send('log', string);


module.exports.beginCompare = ((userName) => {
    $('#removeTabButton').addClass('disabled grey').removeClass('brown'); //you can only use one tab per session so we disable on click
    DOM.compareBtnClickedUpdateDOM();
    validateMyList($('#user1Input').val(), $('#user2Input').val(), userName);
});

module.exports.beginRemove = ((userName) => {
    $('#compareTabButton').addClass('disabled grey').removeClass('brown'); //you can only use one tab per session so we disable on click
    DOM.removeBtnClickedUpdateDOM();
    validateMySingleUser($('#removeGroupsInput').val(), userName);
});


// --------------------------------------------------------------------
// functions validateMySingleUser and validateMyList are for checking to see that the names entered are really user objectsd in AD
//
//

const validateMySingleUser = ((u1, userName) => {
    if (u1 === "") {
        setTimeout(function () {
            DOM.resetMyRemoveForm();
            $('#redMessageBar').html(`You must enter a uniqname`);
        }, 1000);  //if you dont wait for 1000 its too fast for the other animations
        return; //end the function before we even begin our PS process if theres a blank input field
    }

    let ps = new powershell({
        executionPolicy: 'Bypass',
        noProfile: true
    });
    ps.addCommand(`./get-ADUser -u1 ${u1}`);
    ps.invoke()
        .then(output => {
            const data = JSON.parse(output);
            if (data[2].Value.ModuleFound === false) { $('#redMessageBar').html(`This program cannot check your effectice permissions without PowerShell Access Control Module.  Please reinstall the program as administrator.  You can download it from the internet and unzip it to C:\\Program Files\\WindowsPowerShell\\Modules but you will still need local admin to do that.`); return; };
            if (data[0].Error !== false) {
                DOM.resetMyRemoveForm(); //error occurred, reset form
                $('#redMessageBar').html(data[0].Error.Message); //report the error
                return; //end the function
            } else {
                let names = {
                    'user1Name': u1,
                    'user1DN': (data[0].DN).toString(),
                    'currentUser': userName,
                    'user1FName': data[0].FName,
                    'user1LName': data[0].LName
                };
                return listOfGroupsToRemove(names);
            }
            ps.dispose();
        })
        .catch(err => {
            ps.dispose();
        });
});

const validateMyList = ((u1, u2, userName) => {
    if (u1 === "" || u2 === "") {
        setTimeout(function () {
            DOM.resetMyCompareForm();
            $('#redMessageBar').html(`You must enter 2 uniqnames`);
        }, 1000);  //if you dont wait for 1000 its too fast for the other animations
        return; //end the function before we even begin our PS process if theres a blank input field
    }

    let ps = new powershell({
        executionPolicy: 'Bypass',
        noProfile: true
    });
    ps.addCommand('./get-ADUser', [{ u1: `"${u1}"` }, { u2: `"${u2}"` }]);
    ps.invoke()
        .then(output => {
            const data = JSON.parse(output);
            if (data[2].Value.ModuleFound === false) { $('#redMessageBar').html(`This program cannot check your effectice permissions without PowerShell Access Control Module.  Please reinstall the program as administrator.  You can download it from the internet and unzip it to C:\\Program Files\\WindowsPowerShell\\Modules but you will still need local admin to do that.`); return; };
            if (data[0].Error !== false) {
                DOM.resetMyCompareForm(); //error occurred, reset form
                $('#redMessageBar').html(data[0].Error.Message); //report the error
                return; //end the function
            } else {
                let names = {
                    'user1Name': u1,
                    'user2Name': u2,
                    'user1DN': (data[0].DN).toString(),
                    'user2DN': (data[1].DN).toString(),
                    'currentUser': userName,
                    'user1FName': data[0].FName,
                    'user1LName': data[0].LName,
                    'user2FName': data[1].FName,
                    'user2LName': data[1].LName
                };
                $('#user1').append(`<h4 class="brown-text text-darken-3">${names.user1Name}</h4><h3 class="brown-text text-darken-3">${names.user1FName ? names.user1FName : "-"}&nbsp;${names.user1LName ? names.user1LName : "-"}</h3>`);
                $('#user2').append(`<h4 class="brown-text text-darken-3" id="user2sName">${names.user2Name}</h4><h3 "brown-text text-darken-3">${names.user2FName ? names.user2FName : "-"}&nbsp;${names.user2LName ? names.user2LName : "-"}</h3><ul class="blue darken-1"><span class="amber-text text-lighten-1">`);

                $('#queryingSign').html(`Checking ${names.user1Name} and ${names.user2Name}<br><h3>${names.user1FName ? names.user1FName : "-"}&nbsp;and&nbsp;${names.user2FName ? names.user2FName : "-"}</h3>`);

                ps.dispose();
                return listOfGroupsToCompare(names);
            }
        })
        .catch(err => {
            ps.dispose();
        });
});

/*
----------------------------------------------------------------------------
Functions listOfGroupsToCompare and listOfGroupsToRemove
 @param {JSON array element} names:
        {String} u1DN distinguished name of "user 1"
        {String} u2DN distinguished name of "user 2"
        {String} u1Name short name of "user 1"
        {String} u2Name short name of "user 2"
        {String} currentUserName short name of the user running this program

 Description: Updates the DOM with a list of both matching and nonmatching group memberships.
 Then it checks User 1's nonmatching groups to see if the current user has permission to add
 User 2 to any of the groups and it updates the DOM accordingly.

PowerShell scripts:
get-adPrincipalGroups to build 2 lists of group memberships to compare
get-effective-access to see if you can add user 2 to any of user 1's groups
add-adgroupmember to add user 2 to user 1's groups 1 at a time
remove-adGroupMember to undo after a group has been added

*/

const listOfGroupsToCompare = (names) => {
    let ps = new powershell({
        executionPolicy: 'Bypass',
        noProfile: true
    });
    ps.addCommand(`./get-adPrincipalGroups.ps1 -user1 '${names.user1DN}' -user2 '${names.user2DN}'`);
    ps.invoke()
        .then(output => {
            COMPARE(output, names);
            ps.dispose();
        })
        .catch(err => {
            $('#redMessageBar').html(err);
            ps.dispose();
        });
};

const listOfGroupsToRemove = (names) => {
    let ps = new powershell({
        executionPolicy: 'Bypass',
        noProfile: true
    });
    ps.addCommand(`./get-adPrincipalGroups.ps1 -user1 '${names.user1DN}'`);
    ps.invoke()
        .then(output => {
            REMOVE(output, names);
            ps.dispose();
        })
        .catch(err => {
            $('#redMessageBar').html(err);
            ps.dispose();
        });
};


// -------------------------------------------------------------------------------
// COMPARE and REMOVE functions encapsulate all the rest of this application logic
//
//

const COMPARE = (outputfromPS, names) => {

    const _removeADGroup = (groupDN, user2, i, cb) => {
        let psxAsync = new powershell({
            executionPolicy: 'Bypass',
            noProfile: true
        });
        psxAsync.addCommand(`./remove-adGroupMember.ps1 -user '${user2}' -group '${groupDN}' -i ${i}`);
        psxAsync.invoke()
            .then(output => {
                data = JSON.parse(output);
                log(`removed ${data[0].userDN} from ${data[0].groupDN}`);
                DOM.compare_removeADGroup(output);
                CompareStore.UNDOADD(data[0].bind_i);
                psxAsync.dispose();
                cb(null, null);
            })
            .catch(err => {
                $('#redMessageBar').html(err);
                psxAsync.dispose();
                cb(null, null);
            });
    };

    const _addADGroup = (targetGroupName, names, i, cb) => {
        let psAsync = new powershell({
            executionPolicy: 'Bypass',
            noProfile: true
        });
        psAsync.addCommand(`./add-adGroupMember.ps1 -user '${names.user2DN}' -group '${targetGroupName}' -i ${i}`);
        psAsync.invoke()
            .then(output => {
                const data = JSON.parse(output);
                DOM.compare_addADGroup_success(data);
                CompareStore.ADD(data);
                $(`#undoGroupBtn${data[0].bind_i}`).click(function () {
                    $(this).addClass('pulse disabled');
                    PSCommandQueue.push({ type: 'remove', groupDN: data[0].groupDN, user2: data[0].userName, i: data[0].bind_i });
                });
                log(`added ${data[0].user} to ${data[0].groupDN}`);
                psAsync.dispose();
                cb(null, null);
            })
            .catch(err => {
                DOM.compare_addADGroup_error(err);
                psAsync.dispose();
                cb(null, null);
            });
    };

    const _chckEffectivePermissions = (groupDN, currentUser, i, cb) => {
        let thatLEDElement = $(`#LED-${i}`);
        if (thatLEDElement.hasClass('led-green') || thatLEDElement.hasClass('led-red')) { return cb(null, null); } else {
            $(`#LED-${i}`).addClass("led-yellow").removeClass("led-blue");
            psChain.addCommand(`./get-effective-access.ps1 -adgroupdn '${groupDN}' -me ${currentUser} -i ${i}`);
            psChain.invoke()
                .then(output => {
                    let data;
                    try {
                        data = JSON.parse(output);
                        let thisLEDElement = $(`#LED-${data.bind_i}`);
                        if (thisLEDElement.hasClass('led-green') || thisLEDElement.hasClass('led-red')) { return cb(null, null); } else {
                            if (!data.AccessData.includes("FullControl")) {
                                CompareStore.UPDATE(data.bind_i, false);
                                thisLEDElement.addClass("led-red").removeClass("led-yellow");
                            } else {
                                CompareStore.UPDATE(data.bind_i, true);
                                thisLEDElement.addClass("led-green").removeClass("led-yellow");
                                $(`#copyGroupBtn${data.bind_i}`).slideToggle("slow").click(function () {
                                    //disable btn immediately so you cant spam it
                                    $(this).addClass('disabled pulse').removeClass("green");
                                    PSCommandQueue.push({ type: 'add', targetGroupName: data.targetGroupName, names: names, i: data.bind_i });
                                });
                            }
                            return cb(null, null);
                        }
                    }
                    catch (err) {
                        console.log('error not bubbled up left over from a timed out check effective access attempt.');
                        return cb(null, null);
                    }
                })
                .catch(err => {
                    console.log(`not bubbling up this error about trying to write after we've disposed of everything`);
                    return cb(null, null);
                });
            }
        };

        PSCommandQueue = new Queue(function (input, cb) {
            switch (input.type) {
                case 'remove':
                    _removeADGroup(input.groupDN, input.user2, input.i, cb);
                    break;
                case 'add':
                    _addADGroup(input.targetGroupName, input.names, input.i, cb);
                    break;
                case 'checkEffectivePermissions':
                    _chckEffectivePermissions(input.groupDN, input.currentUser, input.i, cb);
                    break;
            }
        }, { afterProcessDelay: 200, maxTimeout: 15000, batchSize: 1 });

        const user1and2JSONfromPS = JSON.parse(outputfromPS);
        const user1 = Set(user1and2JSONfromPS.user1sGroups);
        const user2 = Set(user1and2JSONfromPS.user2sGroups);
        const matchingGroups = (user1.intersect(user2));
        const user1UniqGroups = user1.subtract(matchingGroups);
        const user2UniqGroups = user2.subtract(matchingGroups);
        let letUser1Output = `<ul>`;
        const myADGroupArray = [...user1UniqGroups];
        CompareStore.CREATE(user1UniqGroups, names.user1Name, names.currentUser);

        myADGroupArray.forEach((value, index) => {
            letUser1Output += DOM.compare_parseUser1Unique(value, index);
        });
        let letUser2Output = `<ul class="listFont">`;
        user2UniqGroups.forEach(function (value) {
            letUser2Output += DOM.compare_parseUser2Unique(names.u1Name, value);
        });
        matchingGroups.map(function (value) {
            const groupName = value.split(",")[0].slice(3);
            letUser1Output += DOM.compare_parseMatching(groupName);
            letUser2Output += DOM.compare_parseMatching(groupName);
        });
        DOM.compare_parseListFinalStep(letUser1Output, letUser2Output);
        //At this point the user has two lists to visually compare.
        //Next we check if the current user has access to add user2 to user1's groups.
        //If they can, it will add a green + button to the element.

        const max = myADGroupArray.length;
        if (max < 1) {
            return; //no need to keep going if theres no groups to check effective access against
        }
        let psChain = new powershell({
            executionPolicy: 'Bypass',
            noProfile: true
        });
        PSCommandQueue.on('drain', function (result) {
            console.log("debug--> drain triggered");
            //determine if there were any that timed out
            let missedGroup = CompareStore.GETANYMISSED();//this just returns the i value for the first group that hasnt had effective access verified
            if (missedGroup === 'done') {
                console.log('DEBUG this should be the very end');
                psChain.dispose(); //when this condition is met is the only time you want to dispose of the powershell instance for get-effectiveaccess
            } else {
                PSCommandQueue.push({ type: 'checkEffectivePermissions', groupDN: myADGroupArray[missedGroup], currentUser: names.currentUser, i: missedGroup });
            }
        });
        myADGroupArray.forEach((group, index) => {
            PSCommandQueue.push({ type: 'checkEffectivePermissions', groupDN: group, currentUser: names.currentUser, i: index });
        });

    };




    const REMOVE = (outputfromPS, names) => {

        const _readdGroup = (groupDN, i, cb) => {
            let psReadd = new powershell({
                executionPolicy: 'Bypass',
                noProfile: true
            });
            psReadd.addCommand(`./add-adGroupMember.ps1 -user '${names.user1DN}' -group '${groupDN}' -i ${i}`); //i doesnt matter
            psReadd.invoke()
                .then(output => {
                    const data = JSON.parse(output);
                    log(`added ${data[0].user} to ${data[0].groupDN}`);
                    DOM.remove_readd(data);
                    psReadd.dispose();
                    cb(null, null);
                })
                .catch((err) => {
                    $('#redMessageBar').html(err);
                    psReadd.dispose();
                    cb(null, null);
                });
        };

        const _remGroup = (groupDN, userDN, i, cb) => {
            let psRem = new powershell({
                executionPolicy: 'Bypass',
                noProfile: true
            });
            psRem.addCommand(`./remove-adGroupMember.ps1 -user '${userDN}' -group '${groupDN}' -i ${i}`);
            psRem.invoke()
                .then(output => {
                    const data = JSON.parse(output);
                    log(`removed ${data[0].userDN} from ${data[0].groupDN}`);
                    $(`#REM-Row-${data[0].bind_i}`).slideToggle('slow');
                    RemoveStore.REMEMBER(data[0].bind_i, data[0].groupDN);
                    psRem.dispose();
                    cb(null, null);
                })
                .catch(err => {
                    $('#redMessageBar').html(err);
                    psRem.dispose();
                    cb(null, null);
                });
        };

        const _checkEffectivePermissions = (groupDN, currentUser, i, cb) => {
            $(`#REM-LED-${i}`).addClass("led-yellow").removeClass("led-blue");
            let psChain = new powershell({
                executionPolicy: 'Bypass',
                noProfile: true
            });
            psChain.addCommand(`./get-effective-access.ps1 -adgroupdn '${groupDN}' -me ${currentUser} -i ${i}`);
            psChain.invoke()
                .then(output => {
                    const data = JSON.parse(output);
                    if (!data.AccessData.includes("FullControl")) {
                        RemoveStore.UPDATE(data.bind_i, false);
                        $(`#REM-LED-${data.bind_i}`).addClass("led-red").removeClass("led-yellow");
                    } else {
                        RemoveStore.UPDATE(data.bind_i, true);
                        $(`#REM-LED-${data.bind_i}`).addClass("led-green").removeClass("led-yellow");
                        $(`#REM-ADGroupBtn${data.bind_i}`).slideToggle("slow").click(function () {
                            //disable btn immediately so you cant spam it
                            $(this).addClass('disabled pulse');
                            removePSCommandQueue.push({ type: 'remove', groupDN: data.targetGroupName, userDN: names.user1DN, i: data.bind_i });
                        });
                    }
                    if (data.bind_i < max - 1) {
                        let i = data.bind_i + 1;
                        psChain.dispose();
                        removePSCommandQueue.push({ type: 'checkEffectivePermissions', groupDN: groupNamesList[i], currentUser: names.currentUser, i: i });
                        return cb(null, null);
                    } else {
                        psChain.dispose();
                        return cb(null, null);
                    }
                });
        };

        var removePSCommandQueue = new Queue(function (input, cb) {
            switch (input.type) {
                case 'remove':
                    _remGroup(input.groupDN, input.userDN, input.i, cb);
                    break;
                case 'readd':
                    _readdGroup(input.groupDN, input.i, cb);
                    break;
                case 'checkEffectivePermissions':
                    _checkEffectivePermissions(input.groupDN, input.currentUser, input.i, cb);
                    break;
            }
        }, { maxRetries: 5, maxTimeout: 18000, retryDelay: 1500 });
        removePSCommandQueue.on('failed', function (err) { psChain.dispose(); });

        const groupNamesList = RemoveStore.CREATE(outputfromPS, names.user1Name, names.currentUser);
        DOM.remove_parseListOfGroups(groupNamesList, names);
        $('#undoRemBtn').click(() => {
            $('#undoRemBtn').addClass('pulse disabled');
            removePSCommandQueue.push(RemoveStore.UNDO());
        });

        //iterate through all the groups to check effective access
        let max = groupNamesList.length;
        if (max > 0) { removePSCommandQueue.push({ type: 'checkEffectivePermissions', groupDN: groupNamesList[0], currentUser: names.currentUser, i: 0 }); return; } else { return; };
    };