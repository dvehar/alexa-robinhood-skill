var request = require('request');

var ROBINHOOD_API_HOST = 'https://api.robinhood.com';
var APP_LOGO = 'https://alexa-robinhood-skill-login.herokuapp.com/images/robinhood_alexa_logo.png';
var APP_ID_WHITELIST = ['amzn1.ask.skill.a0112f75-61de-4236-8d20-2462042e6632'];

exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);

        // Prevent someone else from configuring a skill that sends request to this lambda
        if (APP_ID_WHITELIST.indexOf(event.session.application.applicationId) == -1) {
            context.fail("Invalid Application ID");
        }

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        var callback = function (sessionAttributes, speechletResponse) {
            context.succeed(buildResponse(sessionAttributes, speechletResponse));
        };

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request, event.session, callback);
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request, event.session, callback);
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail("Exception: " + e);
    }
};

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId
            + ", sessionId=" + session.sessionId);

    // add any session init logic here
}

/**
 * Called when the user invokes the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId + ", sessionId=" + session.sessionId);

    getNews(launchRequest, session, callback);
}

function getNews(launchRequest, session, callback) {
    console.log("getNews sessionId=" + session.sessionId);

    var userId = session.user.userId;
    var accessToken = session.user.accessToken;

    var errorMessage = (new SSML())
        .openSpeakTag()
        .openParagraphTag()
        .addPlainText('Unable to fetch your updates.')
        .closeParagraphTag()
        .addPlainText('Please try again.')
        .closeSpeakTag()
        .toString();

    var speechletResponse;

    // https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/linking-an-alexa-user-with-a-user-in-your-system#validating-the-access-token
    if (!accessToken) {
        speechletResponse = buildLinkAccountCard();
    } else {
        request({
            url: ROBINHOOD_API_HOST + '/midlands/notifications/stack/',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Token ' + accessToken
            }
        },
        function (error, response, body) {
            if (error) {
                console.log('error');
                console.error(error);
                speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
            } else if (!error && response.statusCode == 401) {
                // login
                speechletResponse = buildLinkAccountCard();
            } else if (!error && response.statusCode == 200) {
                var info = JSON.parse(body);
                var numResults = info.results.length;
                if (numResults > 0) {
                    var rawMessages = info.results.map(function (val) {
                        return val.message;
                    });

                    var speechMessage = rawMessages.reduce(function (acc, val) {
                        var cleanedMessage = val
                            // symbol names (ex: AAPL) should be translated to their
                            // dotted acronym form so the ssml sounds correct. ex: A.A.P.L.
                            .replace(/([A-Z][A-Z]+)/g, function (symbol) {
                                return symbol.split('').map(function (c) {
                                    return c + '.';
                                }).join('');
                            })
                            // '&' is invalid in ssml so replace it with ' and '
                            .replace(/&/g, ' and ')
                            // replace things like '+1.78%' and '-15.9%' with things like
                            // 'up 1.78%' and 'down 15.9%'
                            .replace(/([+-])(\d+\.\d+%)/g, function (fullMatch, gainOrLoss, ammount) {
                                return ((gainOrLoss == '+') ? 'up' : 'down') + ' ' + ammount;
                            });

                        return acc.openParagraphTag()
                            .addPlainText(cleanedMessage)
                            .closeParagraphTag();
                    }, (new SSML())
                        .openSpeakTag()
                        .openParagraphTag()
                        .addPlainText('You have ' + numResults + ' update' + (numResults > 1 ? 's' : '') + '.')
                        .closeParagraphTag());

                    speechMessage = speechMessage
                        .closeSpeakTag()
                        .toString();

                    var cardMessage = rawMessages.join('\n-  -  -  -  -\n');

                    speechletResponse = buildSpeechletResponseWithCard('Robinhood Updates', speechMessage, cardMessage, true);
                } else {
                    var message = (new SSML())
                        .openSpeakTag()
                        .openParagraphTag()
                        .addPlainText('No new updates.')
                        .closeParagraphTag()
                        .addPlainText('Please check again later.')
                        .closeSpeakTag()
                        .toString();
                    speechletResponse = buildSpeechletResponseWithoutCard(message);
                }
            } else {
                console.error('response');
                console.error(response);
                console.error('body');
                console.error(body);
                speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
            }

            return callback({
                sessionAttributes: session.attributes,
                speechletResponse: speechletResponse
            });
        });
    }
}

// http://www.jacklmoore.com/notes/rounding-in-javascript/
// round(1.005,2) -> 1.01
// round(1.9,2) -> 1.90
// round(5,2) -> 5.00
function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals).toFixed(2);
}

// TODO(desmondv): support more than just today
function getOverview(intentRequest, session, callback) {
    console.log("getOverview sessionId=" + session.sessionId);

    var userId = session.user.userId;
    var accessToken = session.user.accessToken;

    var errorMessage = (new SSML())
        .openSpeakTag()
        .openParagraphTag()
        .addPlainText('Unable to fetch your updates.')
        .closeParagraphTag()
        .addPlainText('Please try again.')
        .closeSpeakTag()
        .toString();

    var speechletResponse;

    // https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/linking-an-alexa-user-with-a-user-in-your-system#validating-the-access-token
    if (!accessToken) {
        speechletResponse = buildLinkAccountCard();
    } else {
        var dateRange = ((((intentRequest.intent || {}).slots || {}).DATE_RANGE || {}).value) || undefined;
        dateRange = dateRange ? dateRange.toLowerCase() : dateRange;
        if (dateRange == undefined) {
            dateRange = 'today';
        } else if (dateRange.indexOf('today') != -1) {
            dateRange = 'today';
        } else if (dateRange.indexOf('day') != -1) {
            dateRange = 'yestereday';
        } else if (dateRange.indexOf('week') != -1) {
            dateRange = 'week';
        } else if (dateRange.indexOf('month') != -1) {
            if (dateRange.indexOf('3') != -1 || dateRange.indexOf('three') != -1) {
                dateRange = '3months';
            } else {
                dateRange = 'month';
            }
        } else if (dateRange.indexOf('year') != -1) {
            dateRange = 'year';
        } else if (dateRange.indexOf('all') != -1) {
            dateRange = 'all';
        } else {
            console.warn('dateRange was not mapped: ' + dateRange);
            dateRange = 'today';
        }

        request({
            url: ROBINHOOD_API_HOST + '/portfolios/',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Token ' + accessToken
            }
        },
        function (error, response, body) {
            if (error) {
                console.error('error');
                console.error(error);
                speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
            } else if (!error && response.statusCode == 401) {
                // login
                speechletResponse = buildLinkAccountCard();
            } else if (!error && response.statusCode == 200) {
                var info = JSON.parse(body);
                var numResults = info.results.length;
                if (numResults > 0) {
                    var previousClose = info.results[0].equity;
                    var currentMoneyHeld = info.results[0].extended_hours_equity;
                    var todaysDifference = round(currentMoneyHeld - previousClose, 2);

                    var workInProgressText = (dateRange == 'today') ? '' : 'Sorry, I can only tell you about today right now. ';
                    var gainOrLossText = (todaysDifference >= 0) ? 'made' : 'lost';
                    var speechMessage = (new SSML())
                        .openSpeakTag()
                        .openParagraphTag()
                        .addPlainText(workInProgressText + 'Today you ' + gainOrLossText + ' $' + Math.abs(todaysDifference))
                        .closeParagraphTag()
                        .closeSpeakTag()
                        .toString();
                    var cardMessage = workInProgressText + 'Today you ' + gainOrLossText + ' $' + Math.abs(todaysDifference);
                    speechletResponse = buildSpeechletResponseWithCard('Robinhood Updates', speechMessage, cardMessage, true);
                } else {
                    console.warn('Successful call but no data');
                    var message = (new SSML())
                        .openSpeakTag()
                        .openParagraphTag()
                        .addPlainText("I can't give you updates right now.")
                        .closeParagraphTag()
                        .addPlainText('Please check again later.')
                        .closeSpeakTag()
                        .toString();
                    speechletResponse = buildSpeechletResponseWithoutCard(message);
                }
            } else {
                console.error('response');
                console.error(response);
                console.error('body');
                console.error(body);
                speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
            }

            return callback({
                sessionAttributes: session.attributes,
                speechletResponse: speechletResponse
            });
        });
    }
}

function getQuotes(intentRequest, session, callback) {
    console.log("getQuotes sessionId=" + session.sessionId);

    var userId = session.user.userId;
    var accessToken = session.user.accessToken;
    var stockSymbol = ((((intentRequest.intent || {}).slots || {}).STOCK_SYMBOL || {}).value) || undefined;

    var errorMessage = (new SSML())
        .openSpeakTag()
        .openParagraphTag()
        .addPlainText('Unable to fetch the stock information.')
        .closeParagraphTag()
        .addPlainText('Please try again.')
        .closeSpeakTag()
        .toString();

    var speechletResponse;

    // https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/linking-an-alexa-user-with-a-user-in-your-system#validating-the-access-token
    if (!accessToken) {
        speechletResponse = buildLinkAccountCard();
        return callback({
            sessionAttributes: session.attributes,
            speechletResponse: speechletResponse
        });
    } else if (stockSymbol == undefined) {
        var message = (new SSML())
            .openSpeakTag()
            .openParagraphTag()
            .addPlainText("I didn't hear which stock you are interested in.")
            .closeParagraphTag()
            .addPlainText('Please try again.')
            .closeSpeakTag()
            .toString();
        speechletResponse = buildSpeechletResponseWithoutCard(message);
        return callback({
            sessionAttributes: session.attributes,
            speechletResponse: speechletResponse
        });
    } else {
        stockSymbol = stockSymbol.toLowerCase();
        request({
            url: ROBINHOOD_API_HOST + '/instruments/?query=' + stockSymbol,
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Token ' + accessToken
            }
        },
        function (error, response, body) {
            if (error) {
                console.error('error');
                console.error(error);
                speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
                return callback({
                    sessionAttributes: session.attributes,
                    speechletResponse: speechletResponse
                });
            } else if (!error && response.statusCode == 401) {
                // login
                speechletResponse = buildLinkAccountCard();
                return callback({
                    sessionAttributes: session.attributes,
                    speechletResponse: speechletResponse
                });
            } else if (!error && response.statusCode == 200) {
                var info = JSON.parse(body);
                var numResults = info.results.length;
                if (numResults > 0) {
                    request({
                        url: info.results[0].quote,
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': 'Token ' + accessToken
                        }
                    },
                    function (error, response, body) {
                        if (error) {
                            console.error('error');
                            console.error(error);
                            speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
                            return callback({
                                sessionAttributes: session.attributes,
                                speechletResponse: speechletResponse
                            });
                        } else if (!error && response.statusCode == 401) {
                            // login
                            speechletResponse = buildLinkAccountCard();
                            return callback({
                                sessionAttributes: session.attributes,
                                speechletResponse: speechletResponse
                            });
                        } else if (!error && response.statusCode == 200) {
                            var info = JSON.parse(body);
                            var lastTradePrice = round(info.last_trade_price, 2);
                            var symbol = info.symbol;
                            var speechMessage = (new SSML())
                                    .openSpeakTag()
                                    .openParagraphTag()
                                    .addPlainText(stockSymbol + ' is trading for $' + lastTradePrice)
                                    .closeParagraphTag()
                                    .closeSpeakTag()
                                    .toString();
                            var cardMessage = symbol + ' is trading for $' + lastTradePrice;
                            speechletResponse = buildSpeechletResponseWithCard('Robinhood Updates', speechMessage, cardMessage, true);
                            return callback({
                                sessionAttributes: session.attributes,
                                speechletResponse: speechletResponse
                            });
                        } else {
                            console.error('response');
                            console.error(response);
                            console.error('body');
                            console.error(body);
                            speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
                            return callback({
                                sessionAttributes: session.attributes,
                                speechletResponse: speechletResponse
                            });
                        }
                    });
                } else {
                    console.warn('Successful call but no data');
                    var message = (new SSML())
                        .openSpeakTag()
                        .openParagraphTag()
                        .addPlainText("I couldn't find " + stockSymbol + ".")
                        .closeParagraphTag()
                        .addPlainText('Please try again with a different name.')
                        .closeSpeakTag()
                        .toString();
                    speechletResponse = buildSpeechletResponseWithoutCard(message);
                    return callback({
                        sessionAttributes: session.attributes,
                        speechletResponse: speechletResponse
                    });
                }
            } else {
                console.error('response');
                console.error(response);
                console.error('body');
                console.error(body);
                speechletResponse = buildSpeechletResponseWithoutCard(errorMessage);
                return callback({
                    sessionAttributes: session.attributes,
                    speechletResponse: speechletResponse
                });
            }
        });
    }
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    var intentName = intentRequest.intent.name;

    console.log("onIntent requestId=" + intentRequest.requestId + ", sessionId=" + session.sessionId + ", intentName=" + intentName);

    if (intentName == 'news') {
        getNews(intentRequest, session, callback);
    } else if (intentName == 'overview') {
        getOverview(intentRequest, session, callback);
    } else if (intentName == 'quotes') {
        getQuotes(intentRequest, session, callback);
    } else {
        console.error('Unmapped intent: ' + intentName);
        var speechMessage = (new SSML())
            .openSpeakTag()
            .openParagraphTag()
            .addPlainText('I am unable to handle your request.')
            .closeParagraphTag()
            .addPlainText('Please try something else.')
            .closeSpeakTag()
            .toString();
        var cardMessage = 'Please help me make this skill better!\nYou can email your feedback to desmondvehar@gmail.com';
        callback({
            sessionAttributes: session.attributes,
            speechletResponse: buildSpeechletResponseWithCard('Robinhood Updates', speechMessage, cardMessage, true)
        });
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId + ", sessionId=" + session.sessionId);

    // Add any cleanup logic here
}

function SSML() {
    this.text = '';
}
SSML.prototype.openSpeakTag = function () { this.text += '<speak>'; return this; };
SSML.prototype.closeSpeakTag = function () { this.text += '</speak>'; return this; };
SSML.prototype.openParagraphTag = function () { this.text += '<p>'; return this; };
SSML.prototype.closeParagraphTag = function () { this.text += '</p>'; return this; };
SSML.prototype.addPlainText = function (text) { this.text += text; return this; };
SSML.prototype.addStrongBreak = function () { this.text += '<break strength="strong"/>'; return this; };
SSML.prototype.toString = function () { return this.text; };

function buildLinkAccountCard() {
    return {
        outputSpeech: {
            type: "PlainText",
            text: "Please use the Alexa app to login again."
        },
        card: {
            type: "LinkAccount"
        },
        shouldEndSession: true
    };
}

function buildSpeechletResponseWithoutCard(message) {
    return {
        outputSpeech: {
            type: "SSML",
            ssml: message
        },
        shouldEndSession: true
    };
}

function buildSpeechletResponseWithCard(title, output, cardText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "SSML",
            ssml: output
        },
        card: {
            type: "Standard",
            title: title,
            text: cardText,
            image: {
                smallImageUrl: APP_LOGO,
                largeImageUrl: APP_LOGO
            }
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: ""
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildResponse(responseValues) {
    return {
        version: "1.0",
        sessionAttributes: responseValues.sessionAttributes,
        response: responseValues.speechletResponse
    };
}
