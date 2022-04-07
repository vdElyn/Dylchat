require("dotenv").config();
require("./config/database").connect();
const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();

app.use(cookieParser());
app.use(express.json()); // to support JSON-encoded bodies
app.use(express.urlencoded({ extended: true })); // to support URL-encoded bodies

const path = require("path");
const htmlPath = path.join(__dirname, "/source");
app.use(express.static(htmlPath));

app.use("/styles", express.static(__dirname + '/source/stylesheets'));
app.use("/scripts", express.static(__dirname + '/source/javascripts'));
app.use("/images", express.static(__dirname + '/source/images'));


// Routage //
app.get("/", (req, res) => res.sendFile(__dirname + "/source/login.html")); // Accède à la page de login

app.get("/logout", (req, res) => {
    res.cookie("jwt", "", { maxAge: "1" }) // Supprime le token de l'utilisateur
    res.status(200).redirect("/")
})

const { register, login, getUsers, getUsername } = require("./api/auth");
app.post("/register", register); // Exécute la routine register
app.post("/login", login); // Exécute la routine login 
app.get("/getUsers", getUsers); // Affiche tous les users de la DB 
app.get("/getUsername", getUsername); // Affiche l'username et l'email de l'utilisateur connecté

const { getConversations, newConversation } = require("./api/conversations");
app.post("/newConversation", newConversation);
app.get("/getConversations", getConversations);

// Accède à la page home (si la fonction auth le valide selon le token) 
const auth = require("./middleware/auth");
app.get("/home", auth, (req, res) => res.status(200).sendFile(__dirname + "/source/home.html"));



// WEBSOCKETS //

var {SSL} = process.env;
SSL = SSL == "true" ? true : false;

var cfg = {
    ssl: SSL,
    port: 8080,
    ssl_key: './privkey.pem',
    ssl_cert: './fullchain.pem'
};

var httpServ = ( cfg.ssl ) ? require('https') : require('http');
var server = null;

var processRequest = function( req, res ) {
    console.log("Request received.")
};

const fs = require('fs');
if ( cfg.ssl ) {
    server = httpServ.createServer({
        // providing server with  SSL key/cert
        key: fs.readFileSync( cfg.ssl_key ),
        cert: fs.readFileSync( cfg.ssl_cert )
    }, processRequest ).listen( cfg.port );

} else {
    server = httpServ.createServer(processRequest).listen( cfg.port );
}

const WebSocket = require("ws");
const wss = new WebSocket.Server({ server:server });

// function getTime() {
//     let date = new Date();
//     let milisec = Date.now();
//     let seconds = milisec / 1000;
//     let minutes = seconds / 60;
//     minutes -= date.getTimezoneOffset();
//     let hours = minutes / 60;
//     let result = Math.floor(hours % 24) + ":" + Math.floor(minutes % 60);
//     return result;
// }

const clientList = new Map();
console.log("\nServer is open !\n")

const MessagesModel = require("./model/Messages");
const User = require("./model/user");
const Conversation = require("./model/conversation");

wss.on("connection", async (ws, req) => {
    // let clientId = getRandomID();
    // if (clientId == -1) {
    //     ws.send("ECHEC, veuillez retenter une connexion...");
    //     ws.close();
    // } else {
    //     console.log(`New client with ID : #${clientId}`);
    //     let infoClient = { id: clientId, connection: ws };
    //     listClient.push(infoClient);
    //     ws.send(clientId);
    // }

    // Check si le canal Discussions existe et le créer si non 
    const discussions = await Conversation.findOne({username1:null});
    if (!discussions) {
        await Conversation.create({
            username1: null,
            username2: null,
            lastMessage: null, 
            messageHour: null 
        });
    }
    
    const jwttoken = req.headers.cookie.split("jwt=")[1];
    const user = await User.findOne({ jwttoken });
    const metadata = {username: user.username, email: user.email};
    console.log("%s is now connected!", metadata.username);
    clientList.set(ws, metadata);

    // ToDo: check si il y a un utilisateur avec token invalide et le déconnecter

    sendAllStoredMessages(ws);

    ws.on("message", data => {
        storeMessage(data.toString(), ws);
        let message = JSON.parse(data.toString());
        // let id = -1;
        // for (let i = 0; i < listClient.length; i++) { // Cherche l'id de l'emetteur du message
        //     if (listClient[i].connection == ws) {
        //         id = listClient[i].id;
        //         break;
        //     }
        // }
        // message.author += '#' + id;
        console.log(message);
        message = JSON.stringify(message);
        
        // Envoi du message à tous les clients connectés
        clientList.forEach(function(metadata, clientws) {
            clientws.send(message);
        })

        // ToDo: fetch last message pour la table Conversation
    });

    ws.on("close", () => {
        console.log("%s has disconnected", clientList.get(ws).username);
        clientList.delete(ws);
    });
});

// Send to the client all the stored messages
function sendAllStoredMessages(ws) {
    MessagesModel.find({}, (err, tuples) => {
        for (let i = 0; i < tuples.length; i++) {
            // console.log(`${tuples[i].author} > ${tuples[i].content} (${tuples[i].time})`);
            ws.send(JSON.stringify(tuples[i]));
        }
    });

    // let rawdata = fs.readFileSync('Messages.json');
    // let listMessages = JSON.parse(rawdata);
    // for (let i = 0; i < listMessages.Messages.length; i++) {
    //     ws.send(JSON.stringify(listMessages.Messages[i]));
    // }
}

// Store the message into the JSON file
function storeMessage(message, ws) {
    message = JSON.parse(message);
    // let id = -1;
    // for (let i = 0; i < listClient.length; i++) {
    //     if (listClient[i].connection == ws) {
    //         id = listClient[i].id;
    //         break;
    //     }
    // }
    // message.author += `#${id}`;
    let newMessage = new MessagesModel(message);
    newMessage.save();

    // let rawdata = fs.readFileSync('Messages.json');
    // let listMessages = JSON.parse(rawdata);

    // listMessages.Messages.push(message);
    // fs.writeFileSync("Messages.json", JSON.stringify(listMessages, null, 2));
}

// Génère un ID à 4 chiffres unique
// TODO : Créer l'ID sous forme de 4 digits
// TODO : Limiter le nombre de client dans la room pour éviter une boucle infinie dans cette fonction
// function getRandomID() {
//     let bonId = true;
//     let nbTentative = 10;
//     let id = -1;
//     do {
//         id = Math.floor(Math.random() * 1e4);
//         for (let i = 0; i < listClient.length; i++) {
//             if (listClient[i].id == id) {
//                 bonId = false;
//             }
//         }
//         nbTentative--;
//     } while (!bonId && nbTentative > 0);

//     return id;
// }


module.exports = app;