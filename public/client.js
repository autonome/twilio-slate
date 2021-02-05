$(function() {
  var lastText = "";
  setInterval(function(){
    $.get('/message-for-client', function(message) {
      if (message['from']) {
        var text = "<li>"
          + message['from']
          + ": "
          + message['body']
          + (message['mediaURL'] ? '<img src="' + message.mediaURL + '">' : '')
          + "</li>";
        if (lastText != text) {
          lastText = text;
          $('#messages').html(text);
        }
      }
    });
  }, 1000)
});