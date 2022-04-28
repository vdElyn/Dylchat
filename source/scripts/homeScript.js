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
        return data.username;
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


let myPseudo = "Random";
let activeConversationId;
let messagesDict = {};
let conversations = Array();


/*
var http = location.href.split(":")[0];
http = http == "http" ? "ws" : "wss"; // ws:// si serveur HTTP, sinon wss://
const ws = new WebSocket(http + "://" + location.host.split(':')[0] + ":8080");
*/

// ToDo: ajouter une erreur quand c'est pas possible d'établir la connexion au bout d'un certain temps

// Que faire lorsque la connexion est établie
socket.on("connected", (metadata) => {
    console.log("We are connected,", metadata.username);
});


// Que faire quand le client reçoit un message du serveur
socket.on("newMessage", (message) => {
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
        conversations = res.conversation;
        if (!conversations)
            return;
    
        // Récupération des utilisateurs en ligne
        await getOnlineUsers().then(function(onlineUsers) {
            $("#contact-list").empty();

            for (let i = 0; i < conversations.length; i++) {

                $("#contact-list").append(`
                    <div id="contact-${i}" class="contact">
                        <div class="grid-80-20">
                            <p id="contact-title-${i}" class="contact-title"> RIEN </p>
                            <p id="contact-hour-${i}" class="message-hour"> RIEN </p>
                        </div>
                        <p id="contact-message-${i}" class="last-message">    </p>
                    </div>
                `);

                if (conversations[i]._id == activeConversationId)
                    $(`#contact-${i}`).addClass("selected");

                conversations[i].idcontact = i;

                // Titre de la conversation
                if (conversations[i].userId1 == null)
                    $(`#contact-title-${i}`).text("[Discussions]");
                else if (conversations[i].userId1.username == myPseudo) {
                    // ToDo: ajouter un vrai truc pour afficher les personnes en ligne
                    if (onlineUsers.includes(conversations[i].userId2.username))
                        $(`#contact-title-${i}`).text("🟢 " + conversations[i].userId2.username);
                    else
                        $(`#contact-title-${i}`).text(conversations[i].userId2.username);
                }
                else {
                    if (onlineUsers.includes(conversations[i].userId1.username))
                        $(`#contact-title-${i}`).text("🟢 " + conversations[i].userId1.username);
                    else
                        $(`#contact-title-${i}`).text(conversations[i].userId1.username);
                }
                
                // Contenu du dernier message
                if (conversations[i].lastMessageId) {

                    if (conversations[i].lastMessageId.author == myPseudo)
                        $(`#contact-message-${i}`).text(conversations[i].lastMessageId.content);
                    else
                        $(`#contact-message-${i}`).text(conversations[i].lastMessageId.author + ": " + conversations[i].lastMessageId.content);
                    
                    // Timetamp du dernier message
                    // ToDo: Écrire la date au lieu de l'heure si le message date pas d'aujourd'hui
                    $(`#contact-hour-${i}`).text(convertTimestampToTime(conversations[i].lastMessageId.time));
                    
                } else { 
                    // Nouvelle conversation
                    $(`#contact-message-${i}`).text("Nouvelle conversation");
                    $(`#contact-hour-${i}`).text("-")
                }
                
                // Tronquer le message si trop long pour affichage
                if ($(`#contact-message-${i}`).text().length > 25){
                    $(`#contact-message-${i}`).text($(`#contact-message-${i}`).text().substring(0, 25));
                    $(`#contact-message-${i}`).text($(`#contact-message-${i}`).text().concat("..."));
                }
            }
    
            // Ajout des évènements au clic sur contact
            for (let i = 0; i < conversations.length; i++) {
                let contact = document.querySelector("#contact-" + i);
                contact.addEventListener("click", selectContact, true);
            }
        })
    });
}

var selectContact = function(e) {
    for (let i = 0; i < conversations.length; i++) {
        let contact = document.getElementById("contact-" + i);
        contact.classList.remove("selected");
    }
    e.currentTarget.classList.add("selected");

    // Affichage de la discussion sur la partie droite en cachant l'accueil
    let activeAccueil = document.querySelector("#accueil");
    activeAccueil.classList.add("hidden");
    let footer = document.querySelector("#footer");
    footer.classList.add("hidden");
    let chatHome = document.querySelector("#chat");
    chatHome.classList.remove("hidden");

    // Afficher le nom du destinaire
    let chatname = document.querySelector("#chat-name");
    conversations.forEach(conv => {
        if ("contact-" + conv.idcontact == e.currentTarget.id) {
            activeConversationId = conv._id; // Set active conv ID
            if (conv.userId1 == null)
                chatname.innerHTML = "[Discussions] – Canal général";
            else if (conv.userId1.username == myPseudo)
                chatname.innerHTML = conv.userId2.username
            else
                chatname.innerHTML = conv.userId1.username
        }
    });

    // Afficher les messages
    renderMessages();
};




async function sendMessage() {
    let chatbox = document.getElementById("chat-box");
    if (chatbox.value.length == 0) {
        console.log("Aucun message à envoyer");
        return;
    }

    let message = new Message(activeConversationId, myPseudo, chatbox.value, new Date().getTime());

    socket.emit("newMessage", message);
    chatbox.value = "";
}


// Maintient la scroll bar au bas à chaque message ajouté
function updateScroll() {
    var messagesChat = document.querySelector("#messages-chat");
    messagesChat.scrollTop = messagesChat.scrollHeight;
}

/*
<div class="message text-only">
  <div class="response">
    <p class="text"> ??? </p>
  </div>
</div>
<p class="response-time time"> 15h04</p>  
*/
function renderMessages() {
    $("#messages-chat").empty();
    if (!(activeConversationId in messagesDict))
        return;


    // Récupérer les messages de la conversation courante
    let messagesArray = messagesDict[activeConversationId]
    for (let i = 0; i < messagesArray.length; i++) {

        var author = messagesArray[i].author;

        // Affichage de la date au premier message ou entre 2 messages de dates différentes 
        if ((i == 0) ||
            (i > 0 && new Date(parseInt(messagesArray[i].time)).getDate()) !=
            new Date(parseInt(messagesArray[i - 1].time)).getDate()) {

            let messageDateString = new Date(parseInt(messagesArray[i].time)).toLocaleDateString();
            $("#messages-chat").append(`
                <div class="date">${messageDateString}</div>
            `);
        }

        // Check si premier message pour ajouter le nom
        if (i == 0 || 
            (i > 0 && messagesArray[i - 1].author != author) || 
            (i > 0 && messagesArray[i - 1].author == author && new Date(parseInt(messagesArray[i].time)).getDate() != new Date(parseInt(messagesArray[i - 1].time)).getDate())) {
            
            $("#messages-chat").append(`
                <div class="message">
                    <p id="chat-username-${i}" class="username">RIEN</p>
                </div>
            `);

            if (myPseudo == author) 
                $(`#chat-username-${i}`).addClass("response-username");

            $(`#chat-username-${i}`).text(author);
        }

        if (myPseudo == author) {
            $("#messages-chat").append(`
                <div class="message text-only">
                    <div class="response">
                        <p id="chat-response-${i}" class="text">RIEN</p>
                    </div>
                </div>
            `);

            $(`#chat-response-${i}`).text(messagesArray[i].content);
        } else {
            $("#messages-chat").append(`
                <div class="message text-only">
                    <p id="chat-message-${i}" class="text">RIEN</p>
                </div>
            `);

            $(`#chat-message-${i}`).text(messagesArray[i].content);
        }

        // Affichage de l'heure si dernier message d'une personne ou écart de 5 minutes
        if ((i == messagesArray.length - 1) || // Dernier message du tableau
            (i < messagesArray.length && messagesArray[i + 1].author != author) || // Dernier message d'une personne
            (i < messagesArray.length && messagesArray[i + 1].author == author && (new Date(parseInt(messagesArray[i].time)).getDate()) != new Date(parseInt(messagesArray[i + 1].time)).getDate()) ||  //Dernier message d'une date différente
            (i > 0 && new Date(parseInt(messagesArray[i].time)) >
                new Date(parseInt(messagesArray[i - 1].time) + 5 * 60000))) // 5 minutes entre 2 messages d'une même personne
            {

            let messageTimeString = convertTimestampToTime(messagesArray[i].time);
            $("#messages-chat").append(`
                <div class="message">
                    <p id="chat-time-${i}" class="time">${messageTimeString}</p>
                </div>
            `);

            if (myPseudo == author)
                $(`#chat-time-${i}`).addClass("response-time")
        }
    }
    updateScroll();
}


window.addEventListener('DOMContentLoaded', async event => {

    getUsername().then(function(res) {
        myPseudo = res;
        // Affichage du pseudo de l'utilisateur connecté
        document.querySelector(".mon-profil").innerText = myPseudo;
    });

    await renderConversations();

    // Touche entrée liée au bouton d'envoi de message
    window.addEventListener('keyup', function(event) {
        if (event.keyCode === 13) {
            this.document.getElementById("send").click();
        }
    });

});


/* -------------------- Menu d'ajout de conversation -------------------- */
function ouvrirMenu() {
    $("#text_ajout_contact").empty();
    document.getElementById("menu_ajouter_conv").style.display = "grid";
    document.getElementById("menu_deco").style.display = "none";
}

function fermerMenu() {
    document.getElementById("menu_ajouter_conv").style.display = "none";
}

async function ajouterContact() {
    // POST Request 
    const body = { username2: $("#entree_pseudo").val() };
    $("#entree_pseudo").val("");
    const res = await fetch('/api/chats/newConversation', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
    });

    res.json().then(response => {
        if (response.status === 200) {
            socket.emit("newConversation", response.userId1, response.userId2);
        } else {
            $("#text_ajout_contact").text(response.error);
        }
    }).catch(error => console.error('Error:', error))
}

socket.on("newConversation", () => {
    fermerMenu();
    renderConversations();
});

socket.on("newConversationError", (error) => {
    $("#text_ajout_contact").text(error);
});

/* -------------------- Menu de déconnexion -------------------- */

function ouvrirDeconnexion() {
    document.getElementById("menu_deco").style.display = "grid";
    document.getElementById("menu_ajouter_conv").style.display = "none";
}

function fermerDeconnexion() {
    document.getElementById("menu_deco").style.display = "none";
}

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

function accueilpage(){
	//document.getElementById("menu_deco").style.display = "none";
    document.getElementById("menu_ajouter_conv").style.display = "none";
    document.getElementById("menu_deco").style.display = "none";
	let activeAccueil = document.querySelector("#accueil");
    activeAccueil.classList.remove("hidden");
    let footer = document.querySelector("#footer");
    footer.classList.remove("hidden");
    let chatHome = document.querySelector("#chat");
    chatHome.classList.add("hidden");
    for (let i = 0; i < conversations.length; i++) {
        let contact = document.getElementById("contact-" + i);
        contact.classList.remove("selected");
    }
}