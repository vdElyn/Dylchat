const socket = io();

class Message {
    constructor(idchat, author, content, time) {
        this.idchat = idchat;
        this.author = author;
        this.content = content;
        this.time = time;
    }
}

async function getUsername() {
    try {
        const res = await fetch('/api/users/getUsername', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        })
        const data = await res.json()
        if (res.status === 400 || res.status === 401) {
            return display.textContent = `${data.message}. ${data.error ? data.error : ''}`
        }
        return data;
    } catch (err) {
        console.log(err.message)
    }
}

async function getConversations() {
    try {
        const res = await fetch('/api/chats/getConversations', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        })
        const data = await res.json()
        if (res.status === 400 || res.status === 401) {
            console.log(`${data.message}. ${data.error ? data.error : ''}`)
        }
        return data;
    } catch (err) {
        console.log(err.message)
    }
}

async function getOnlineUsers() {
    try {
        const res = await fetch('/api/users/getOnlineUsers', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        })
        const data = await res.json()
        if (data.status === 200)
            return data.users;
        else
            console.log(data);
    } catch (err) {
        console.log(err.message)
    }
}

// Square and Multiply from: https://gist.github.com/krzkaczor/0bdba0ee9555659ae5fe
function expmod(a, b, n) {
    a = a % n;
    var result = 1;
    var x = a;

    while(b > 0){
    var leastSignificantBit = b % 2;
    b = Math.floor(b / 2);

    if (leastSignificantBit == 1) {
        result = result * x;
        result = result % n;
    }

    x = x * x;
    x = x % n;
    }
    return result;
};

let myPseudo = "Random";
let myId = "";
let activeConversationId;
let messagesDict = {};
let conversations = Array();
let AESKeys = new Map();

/*
var http = location.href.split(":")[0];
http = http == "http" ? "ws" : "wss"; // ws:// si serveur HTTP, sinon wss://
const ws = new WebSocket(http + "://" + location.host.split(':')[0] + ":8080");
*/

// Que faire lorsque la connexion est ??tablie
socket.on("connected", (metadata) => {
    console.log("We are connected,", metadata.username);
});

// Que faire quand le client re??oit un message du serveur
socket.on("newMessage", (message) => {
    // Si le message est dans un chat chiffr?? d??verrouill?? : le d??chiffrer
    if (AESKeys.has(message.idchat)) {
        message.content = CryptoJS.AES.decrypt(message.content, AESKeys.get(message.idchat));
        message.content = message.content.toString(CryptoJS.enc.Utf8);
    }

    // Stockage des messages dans le dictionnaire messagesDict selon les chats :
    //      "chatid": [message, message, message]
    //      "chatid": [message, message, message]
    if (!(message.idchat in messagesDict))
        messagesDict[message.idchat] = Array()
    messagesDict[message.idchat].push(message);

    // Afficher les messages si le nouveau message est sur la conversation active
    if (message.idchat == activeConversationId)
        renderMessages();

    // Actualiser lastMessage et messageHour et faire remonter la conversation
    renderConversations();
});


socket.on("allMessages", (msgs) => {
    msgs.forEach(message => {
        if (!(message.idchat in messagesDict))
            messagesDict[message.idchat] = Array()
        messagesDict[message.idchat].push(message);
    });

    // Afficher les messages et actualiser les conversations
    renderMessages();
    renderConversations();
});

function convertTimestampToTime(timestamp) {
    let msgdate = new Date(parseInt(timestamp));
    // console.log(msgdate.toLocaleString());
    return msgdate.toLocaleTimeString().slice(0, 5);
}

function convertTimestampToDate(timestamp) {
    let msgdate = new Date(parseInt(timestamp));
    return msgdate.toLocaleDateString();
}


async function renderConversations() {
    await getConversations().then(async function(res) {
        conversations = res.chats;

        if (!conversations)
            return;

        // Filtrage des conversations chiffr??es dont la cl?? a ??t?? saisie         
        let stillEncrypted = 0; // Nombre de conversations non d??chiffr??es
        for (let i = conversations.length - 1; i >= 0; --i) {
            if (conversations[i].encrypted) {
                if (AESKeys.has(conversations[i]._id)) {
                    conversations[i].unlocked = true;
                }
                else {
                    conversations[i].unlocked = false;
                    stillEncrypted++;
                }
            }
        }

        // R??cup??ration des utilisateurs en ligne
        await getOnlineUsers().then(function(onlineUsers) {
            $("#contact-list").empty();
            for (let i = 0; i < conversations.length; i++) {
                // Pas d'affichage des conversations chiffr??es non d??verrouill??es
                if (conversations[i].encrypted && !conversations[i].unlocked)
                    continue;

                $("#contact-list").append(`
                    <div id="contact-${i}" class="row sideBar-body">
                      <div class="sideBar-main">
                          <div class="row">
                              <div class="col-sm-8 col-xs-8 sideBar-name">
                                  <span id="contact-title-${i}" class="name-meta"> RIEN </span>
                              </div>
                              <div class="col-sm-4 col-xs-4 pull-right sideBar-time">
                                  <span id="contact-hour-${i}" class="time-meta pull-right"> RIEN </span>
                              </div>
                          </div>
                        </div>
                      <div class="sideBar-main">
                        <div class="row">
                          <div class="col-sm-12 col-xs-12 sideBar-lastMessage">
                                <span id="contact-message-${i}" class="lastMessage-meta"> RIEN </span>
                          </div> 
                        </div>
                      </div>
                    </div>
                `);

                if (conversations[i]._id == activeConversationId)
                    $(`#contact-${i}`).addClass("selected");

                conversations[i].idcontact = i;

                // Titre de la conversation
                let contactTitle = "";
                if (conversations[i].userId1 == null)
                    contactTitle = "[Discussions]";
                else {
                    if (conversations[i].encrypted)
                        contactTitle += "???? ";
                    if (conversations[i].userId1.username == myPseudo) {
                        // ToDo: ajouter un vrai truc CSS pour distinguer les personnes en ligne et les chats chiffr??s
                        if (onlineUsers.includes(conversations[i].userId2.username))
                            contactTitle += "???? "
                        contactTitle += conversations[i].userId2.username;
                    } else {
                        if (onlineUsers.includes(conversations[i].userId1.username))
                            contactTitle += "???? "
                        contactTitle += conversations[i].userId1.username;
                    }
                }
                $(`#contact-title-${i}`).text(contactTitle);

                // Contenu du dernier message
                if (conversations[i].lastMessageId) {

                    if (conversations[i].lastMessageId.author == myPseudo)
                        $(`#contact-message-${i}`).text(conversations[i].lastMessageId.content);
                    else
                        $(`#contact-message-${i}`).text(conversations[i].lastMessageId.author + ": " + conversations[i].lastMessageId.content);

                    // Timestamp du dernier message (affich??e en date si message ancien)
                    let messageDate = new Date(parseInt(conversations[i].lastMessageId.time)).getDate();
                    if (messageDate == new Date().getDate())
                        $(`#contact-hour-${i}`).text(convertTimestampToTime(conversations[i].lastMessageId.time));
                    else
                        $(`#contact-hour-${i}`).text(convertTimestampToDate(conversations[i].lastMessageId.time));

                } else {
                    // Nouvelle conversation
                    $(`#contact-message-${i}`).text("Nouvelle conversation");
                    $(`#contact-hour-${i}`).text("-")
                }
            }

            // Ajout des ??v??nements au clic sur contact
            for (let i = 0; i < conversations.length; i++) {
                $(`#contact-${i}`).on("click", selectContact);
            }

            // ToDo: r??activer le if quand tout est ok
            // if (stillEncrypted) {
                $("#contact-list").append(`
                <div class="row sideBar-alert-body">
                    <div class="sideBar-main-alert">
                        <div class="row">
                            <div class="col-sm-8 col-xs-8 sideBar-alert">
                                <span class="alert-meta"> ???? Vous avez ${stillEncrypted} conversation(s) chiffr??e(s) </span>
                            </div>
                            <div class="col-sm-8 col-xs-8 sideBar-alert">
                                <span class="alert-meta text-link-blue" onclick="AESKeysPopup()"> Cliquer ici pour les d??verrouiller </span>
                            </div>
                        </div>
                    </div>
                </div>
                `);
            // }
        })
    });
}

function selectContact(e) {
    conversations.forEach(conv => {
        if ("contact-" + conv.idcontact == e.currentTarget.id) {
            openChat(conv);
            return;
        }
    });
};

async function sendMessage() {
    if ($("#chat-box").val().length == 0) {
        console.log("Aucun message ?? envoyer");
        return;
    }
    
    let message = null;
    // Si on est dans une conversation chiffr??e : chiffrer le message
    if (AESKeys.has(activeConversationId)) {
        let encrypted = CryptoJS.AES.encrypt($("#chat-box").val(), AESKeys.get(activeConversationId));
        message = new Message(activeConversationId, myPseudo, encrypted.toString(), new Date().getTime());
    } else {
        // Sinon : envoyer directement
        message = new Message(activeConversationId, myPseudo, $("#chat-box").val(), new Date().getTime())
    }
    
    socket.emit("newMessage", message);
    $("#chat-box").val("");
}


// Maintient la scroll bar au bas ?? chaque message ajout??
function updateScroll() {
    var messagesChat = document.querySelector("#messages-chat");
    messagesChat.scrollTop = messagesChat.scrollHeight;
}

// ToDo: faire un updateScroll apr??s renderConversation


function renderMessages() {
    $("#messages-chat").empty();
    if (!(activeConversationId in messagesDict))
        return;

    // R??cup??rer les messages de la conversation courante
    let messagesArray = messagesDict[activeConversationId]
    for (let i = 0; i < messagesArray.length; i++) {

        var author = messagesArray[i].author;
        var messageDate = new Date(parseInt(messagesArray[i].time)).getDate();

        // Affichage de la date au premier message ou entre 2 messages de dates diff??rentes 
        if ((i == 0) ||
            (i > 0 && messageDate != new Date(parseInt(messagesArray[i - 1].time)).getDate())) {

            let messageDateString = convertTimestampToDate(messagesArray[i].time);
            $("#messages-chat").append(`
                <div class="row message-body">
                    <div class="message-main">
                        <span class="message-date">${messageDateString}</span>
                    </div>
                </div>
            `);
        }


        // Message envoy?? 
        if (myPseudo == author) {
            $("#messages-chat").append(`
              <div class="row message-body">
                  <div class="col-sm-12 message-main-sender">
                      <div class="row sender-nick">
                        <span id="chat-username-${i}">  </span>
                      </div>
                      <div class="sender">
                          <div id="chat-content-${i}" class="message-text">
                              RIEN
                          </div>
                          <span id="chat-time-${i}" class="message-time pull-right">
                              RIEN
                          </span>
                      </div>
                  </div>
              </div>
          `);
        }
        // Message re??u
        else {
            $("#messages-chat").append(`
              <div class="row message-body">
                  <div class="col-sm-12 message-main-receiver">
                      <div class="row receiver-nick">
                        <span id="chat-username-${i}">  </span>
                      </div>
                      <div class="receiver">
                          <div id="chat-content-${i}" class="message-text">
                              RIEN
                          </div>
                          <span id="chat-time-${i}" class="message-time pull-right">
                              RIEN
                          </span>
                      </div>
                  </div>
              </div>
          `);
        }

        $(`#chat-content-${i}`).text(messagesArray[i].content);
        $(`#chat-time-${i}`).text(convertTimestampToTime(messagesArray[i].time));

        // Check si premier message pour ajouter le nom
        if (i == 0 ||
            (i > 0 && messagesArray[i - 1].author != author) ||
            (i > 0 && messagesArray[i - 1].author == author && messageDate != new Date(parseInt(messagesArray[i - 1].time)).getDate())) {
            $(`#chat-username-${i}`).text(author);
        }

    }
    updateScroll();
}


window.addEventListener('DOMContentLoaded', async event => {

    getUsername().then(function(data) {
        myPseudo = data.username;
        myId = data.id;
        // Affichage du pseudo de l'utilisateur connect??
        $("#username").text(myPseudo);
    });

    await renderConversations();

    // Touche entr??e li??e au bouton d'envoi de message
    window.addEventListener('keyup', function(event) {
        if (event.keyCode === 13) {
            $("#send").click();
        }
    });

    // Link des boutons ?? leurs fonctions
    $("#back-button").click(function() {
        $("#partie-gauche").slideToggle("fast");
    });

    $("#logout-button").on("click", function(event) {
        $('#logoutPopup').modal('show');
    });

    $("#add-contact-button").on("click", openAddContactPopup);

});


/* -------------------- Menu d'ajout de conversation -------------------- */

function openAddContactPopup(event) {
    $("#addContactError").addClass("invisible");
    $('#addContactPopup').modal('show');

    // Bouton confirmer la conversation non chiffr??e
    $("#addContactConfirm").on("click", async function(e) {
        e.preventDefault();

        // Check si l'utilisateur a entr?? un pseudo
        if ($("#addContactInput").val().length == 0) {
            $("#addContactError").text("Veuillez entrer l'identifiant de l'utilisateur ?? qui vous souhaitez ??crire.");
            $("#addContactError").removeClass("invisible");
            return;
        }

        // POST Request 
        const body = { username2: $("#addContactInput").val() };
        $("#addContactInput").val("");
        const res = await fetch('/api/chats/newConversation', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });

        res.json().then(response => {
            if (response.status === 200) {
                socket.emit("newConversation", { userId1: response.userId1, userId2: response.userId2 });
                $('#addContactPopup').modal('hide');
                $("#addContactConfirm").off('click');
            } else {
                $("#addContactError").text(response.error);
                $("#addContactError").removeClass("invisible");
            }
        }).catch(error => console.error('Error:', error))
    });

    // Bouton Conversation chiffr??e
    $('#openEndToEndPopup').on('click', async function(e) {
        e.preventDefault();

        // Check si l'utilisateur a entr?? un pseudo
        if ($("#addContactInput").val().length == 0) {
            $("#addContactError").text("Veuillez entrer l'identifiant de l'utilisateur ?? qui vous souhaitez ??crire.");
            $("#addContactError").removeClass("invisible");
            return;
        }

        // POST Request 
        const body = { username2: $("#addContactInput").val() };
        // $("#addContactInput").val("");
        const res = await fetch('/api/chats/isDiffieHellmanable', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        });

        res.json().then(response => {
            if (response.status === 200) {
                $("#addContactInput").val("");
                $('#openEndToEndPopup').off('click');
                $('#addContactPopup').modal('hide');
                processDiffieHellman(response);
            } else {
                $("#addContactError").text(response.error);
                $("#addContactError").removeClass("invisible");
            }
        }).catch(error => console.error('Error:', error))
    });

};

socket.on("newConversation", async() => {
    await renderConversations();
});

/* -------------------- Diffie-Hellman -------------------- */

let senderSecret;

function processDiffieHellman(data) {
    $('#diffieHellmanPopup').modal({
            backdrop: 'static',
            keyboard: false
        })
        // ToDo: trouver un moyen de pr??venir l'utilisateur que si il quitte, le protocole s'annule (et emit un cancelDiffieHellman)

    // Boutons de pop-up et placeholder de cl?? r??sultat
    $('#diffieHellmanError').addClass("invisible");
    $('#readyDiffieHellman').show();
    $('#cancelDiffieHellman').show();
    $('#terminateDiffieHellman').hide();
    $('#generatedSymKey').val("");

    $('#diffieHellmanPopup').modal('show');
    $('#otherUserDFProgress').text(`Clique sur "Je suis pr??t" pour notifier ${data.user2}`);

    // ToDo apr??s DH authentifi??: si les cl??s sont d??j?? renseign??es: les ??crire dans publicKeyInput et privateKeyInput 

    $('#cancelDiffieHellman').on('click', function(e) {
        e.preventDefault();
        socket.emit("cancelDiffieHellman", data.userId1, data.userId2);
        $('#diffieHellmanPopup').modal('hide');
        return;
    });

    $('#readyDiffieHellman').on('click', function(e) {
        e.preventDefault();
        $('#readyDiffieHellman').off('click');
        $('#otherUserDFProgress').text(`En attente de ${data.user2}...`);
        // Calcul de la valeur publique A du DH
        let array = new Uint32Array(10);
        window.crypto.getRandomValues(array);
        senderSecret = array[0] % data.p;
        data.publicA = expmod(data.g, senderSecret, data.p);
        // Envoi des donn??es au serveur pour transfert ?? user2
        socket.emit("engageDiffieHellman", data);
    });
}

socket.on("acceptedDiffieHellman", async(data) => {
    // Retrait des deux boutons
    $('#readyDiffieHellman').hide();
    $('#cancelDiffieHellman').hide();
    $('#terminateDiffieHellman').show();

    $('#otherUserDFProgress').text(`La conversation chiffr??e avec ${data.user2} a ??t?? cr????e.`);
    $('#diffieHellmanError').text("Veillez ?? enregistrer la cl?? sym??trique dans un fichier local de cl??s avant de fermer de cette fen??tre.");
    $('#diffieHellmanError').removeClass("invisible");
    let secretKey = expmod(data.publicB, senderSecret, data.p);

    // POST Request pour la cr??ation de la conversation 
    const body = { username2: data.user2 };
    const res = await fetch('/api/chats/newEncryptedConversation', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
    })

    res.json().then(response => {
        // Affichage de l'ID de conversation et de la cl?? sym??trique 
        $('#generatedSymKey').val(`"${response.idChat}":  "${secretKey.toString(16)}", `);
        // Stockage de la paire en Map
        AESKeys.set(response.idChat, secretKey.toString(16));
        // Envoi de la nouvelle conversation aux deux parties
        socket.emit("newConversation", { userId1: response.userId1, userId2: response.userId2 });
    }).catch(error => console.error('Error:', error))
});

socket.on("notifDiffieHellman", (data) => {
    $('#notifDHPopup').modal('show');
    $('#notifDHText').text(`${data.user1} souhaite engager une conversation priv??e avec vous.`)

    $('#rejectDiffieHellman').on('click', function(e) {
        e.preventDefault();
        socket.emit("cancelDiffieHellman", data.userId1, data.userId2);
        $('#cancelDiffieHellman').off('click');
        $('#notifDHPopup').modal("hide");
        return;
    });

    $('#acceptDiffieHellman').on('click', async function(e) {
        e.preventDefault();
        // Calcul de la valeur publique B du DH
        let array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        let receiverSecret = array[0] % data.p;
        data.publicB = expmod(data.g, receiverSecret, data.p);
        socket.emit("acceptedDiffieHellman", data);

        $('#acceptDiffieHellman').off('click');
        await new Promise(r => setTimeout(r, 1000));
        $('#notifDHPopup').modal("hide");
        finishDiffieHellman(data, receiverSecret);
        return;
    });
});


function finishDiffieHellman(data, receiverSecret) {
    let secretKey = expmod(data.publicA, receiverSecret, data.p);

    let idChat = null;
    conversations.forEach(conv => {
        if (conv.userId1 != null) {
            if ((conv.userId1._id == data.userId1 && conv.userId2._id == data.userId2) ||
                (conv.userId1._id == data.userId2 && conv.userId2._id == data.userId1)) {
                idChat = conv._id;
            }
        }
    });


    $('#diffieHellmanPopup').modal({
            backdrop: 'static',
            keyboard: false
        })

    // Boutons de popup
    $('#readyDiffieHellman').hide();
    $('#cancelDiffieHellman').hide();
    $('#terminateDiffieHellman').show();

    // ToDo: trouver un moyen de pr??venir l'utilisateur que si il quitte, le protocole s'annule (et emit un cancelDiffieHellman)
    $('#diffieHellmanPopup').modal('show');
    $('#otherUserDFProgress').text(`La conversation chiffr??e avec ${data.user1} a ??t?? cr????e.`);
    // Affichage de l'ID de conversation et de la cl?? sym??trique 
    $('#generatedSymKey').val(`"${idChat}":  "${secretKey.toString(16)}", `);
    // Stockage de la paire en Map
    AESKeys.set(idChat, secretKey.toString(16));
    $('#diffieHellmanError').text("Veillez ?? enregistrer la cl?? sym??trique dans un fichier local de cl??s avant de fermer de cette fen??tre.");
    $('#diffieHellmanError').removeClass("invisible");
    renderConversations();
}

socket.on("cancelDiffieHellman", () => {
    $('#otherUserDFProgress').text(`Protocole Diffie-Hellman annul??.`);
    // ToDo: cancelDiffieHellman : dire qui a annul?? et fermer la fenetre 
});


/* -------------------- AES -------------------- */

function decryptAllMessages(idChat, key) {
    if (!(idChat in messagesDict)) // Pas d'ancien messages dans cette conversation 
        return;
    
    let messagesArray = messagesDict[idChat];
    for (let i = 0; i < messagesArray.length; i++) {
        messagesArray[i].content = CryptoJS.AES.decrypt(messagesArray[i].content, AESKeys.get(idChat));
        messagesArray[i].content = messagesArray[i].content.toString(CryptoJS.enc.Utf8);
    }
}

// Pop-up pour la saisie des cl??s AES
function AESKeysPopup() {
    $("#AESKeysError").addClass("invisible");
    $('#AESKeysPopup').modal('show');

    $('#AESKeysConfirm').on('click', function(e) {
        $("#AESKeysError").addClass("invisible");
        e.preventDefault();

        if (!$('#AESKeysInput').val().length) {
            $("#AESKeysError").text("Veuillez saisir au minimum une cl?? AES pour valider.");
            $("#AESKeysError").removeClass("invisible");
        }

        // Parsing des IDs conv / cl??s AES
        const jsonRegExp = new RegExp('\".+\"\ *\:\ *\".+\"'); // Regex "dfdf":"dsfsd"
        const parsed = ($('#AESKeysInput').val().match(jsonRegExp))[0]; // ToDo : tester cette m??thode
        console.log(parsed);

        if (parsed.length) {
            // Retirer les espaces
            let string = parsed.replace(/ /g, "").replace(/"/g, "");
            const keys = string.split(",");
            console.log(keys);
            for (const key of keys) {
                AESKeys.set(key.split(":")[0], key.split(":")[1]);
                // D??chiffrer les messages du chat
                decryptAllMessages(key.split(":")[0], key.split(":")[1]) 
            }
            renderConversations();
            $('#AESKeysInput').val("");
            $('#AESKeysPopup').modal('hide');
        } else {
            $("#AESKeysError").text("Le format est invalide.");
            $("#AESKeysError").removeClass("invisible");
        }
    })
}


/* -------------------- Menu de d??connexion -------------------- */

async function deconnexion() {
    try {
        const res = await fetch('/api/users/logout', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        })
        const data = await res.json()

        if (data.status === 200) {
            window.location = data.redirect;
        }
    } catch (err) {
        console.log(err.message)
    }
}

function accueilpage() {
    $("#menu_ajouter_conv").css("display", "none");
    $("#menu_deco").css("display", "none");

    $("#accueil").removeClass("hidden");
    $("#footer").removeClass("hidden");
    $("#chat").addClass("hidden");

    for (let i = 0; i < conversations.length; i++) {
        $(`contact-${i}`).removeClass("selected");
    }
}


function openChat(chat) {
    for (let i = 0; i < conversations.length; i++) {
        $(`#contact-${i}`).removeClass("selected");
    }
    $(`#contact-${chat.idcontact}`).addClass("selected");

    // Affichage de la discussion sur la partie droite en cachant l'accueil
    $("#accueil").addClass("hidden");
    $("#footer").addClass("hidden");

    $("#header-chat").removeClass("hidden");
    $("#messages-chat").removeClass("hidden");
    $("#reply-chat").removeClass("hidden");

    // Si ??cran XS : retirer la partie gauche au clic sur un contact
    if ($(window).width() < 768) {
        // $("#partie-gauche").addClass("hidden");
        $("#partie-gauche").slideToggle("fast"); // ToDo: faire un slide left/right (cf. jquery-ui easing)
    };

    // Afficher le nom du destinaire
    activeConversationId = chat._id; // Set active conv ID
    if (chat.userId1 == null)
        $("#chat-name").text("[Discussions] ??? Canal g??n??ral");
    else if (chat.userId1.username == myPseudo)
        $("#chat-name").text(chat.userId2.username);
    else
        $("#chat-name").text(chat.userId1.username);

    // Afficher les messages
    renderMessages();
}


function openGeneralChat() {
    for (let i = 0; i < conversations.length; i++) {
        $(`#contact-${i}`).removeClass("selected");
    }

    conversations.forEach(conv => {
        if (conv.userId1 == null) {
            openChat(conv);
            return;
        }
    });
}