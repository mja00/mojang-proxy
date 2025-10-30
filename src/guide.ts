export const html =`<html>
	<head>
		<title>Mojang Proxy</title>
	</head>
	<body>
		<h1>Mojang Proxy</h1>
		<p>
			For this to work you'll need to download <a href="https://papermc.io/downloads/paper">Paper</a> in order to override the hosts for Minecraft.
			<br>
			Once you've done that set the following hosts using <a href="https://docs.papermc.io/paper/reference/system-properties/#minecraftapisessionhost">Paper's system properties</a>:
			<ul>
				<li><code>-Dminecraft.api.services.host=https://proxy.mart.fyi/services</code></li>
				<li><code>-Dminecraft.api.session.host=https://proxy.mart.fyi/sessions</code></li>
			</ul>
		</p>
	</body>
</html>`