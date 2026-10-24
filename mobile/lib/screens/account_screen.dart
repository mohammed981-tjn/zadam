/// «حسابي»: الدخول وإنشاء الحساب، ثمّ ما يخصّك (البند ١٣٨).
///
/// Signed out, it offers the website's two doors: sign in (by number, or by
/// email for the accounts made that way — the owner's administrator account is
/// one) and create an account by number, as farmer and landowner or as
/// investor. Signed in, it says whose account this is and of what kind — the
/// thing whose absence on the website left the owner in the wrong account on
/// 22 October — then the review list for an administrator, the notifications,
/// and the person's own land.
///
/// Registering land and asking for a partnership still happen on the website:
/// they carry documents and a map, and get their own screens with «حدّد أرضك
/// من الخريطة» (backlog 134). Until then the buttons open the website's page.
library;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../account.dart';
import '../api.dart';
import '../theme.dart';
import 'messages_screen.dart';

/// Opens a page of the website in the phone's browser.
Future<void> openOnSite(BuildContext context, String path) async {
  final messenger = ScaffoldMessenger.of(context);
  final ok = ApiConfig.siteUrl.isNotEmpty &&
      await launchUrl(Uri.parse('${ApiConfig.siteUrl}$path'),
          mode: LaunchMode.externalApplication);
  if (!ok) {
    messenger.showSnackBar(const SnackBar(content: Text('تعذّر فتح الموقع.')));
  }
}

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('حسابي')),
      body: ValueListenableBuilder<Session?>(
        valueListenable: accountController,
        builder: (context, session, _) {
          if (!accountController.loaded) return const Center(child: CircularProgressIndicator());
          return session == null ? const _SignedOut() : const _SignedIn();
        },
      ),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Signed out
 * ------------------------------------------------------------------ */

class _SignedOut extends StatefulWidget {
  const _SignedOut();

  @override
  State<_SignedOut> createState() => _SignedOutState();
}

class _SignedOutState extends State<_SignedOut> {
  bool _signUp = false;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Text(
          'حسابك في سوداقري هو نفسه في الموقع والتطبيق: الرقم وكلمة المرور نفسهما.',
          textAlign: TextAlign.center,
          style: TextStyle(color: mutedOn(context), height: 1.7),
        ),
        const SizedBox(height: 16),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('ادخل'), icon: Icon(Icons.login)),
            ButtonSegment(value: true, label: Text('حساب جديد'), icon: Icon(Icons.person_add_alt)),
          ],
          selected: {_signUp},
          onSelectionChanged: (s) => setState(() => _signUp = s.first),
        ),
        const SizedBox(height: 20),
        if (_signUp)
          _SignUpForm(onCreatedElsewhere: () => setState(() => _signUp = false))
        else
          const _SignInForm(),
      ],
    );
  }
}

class _PhoneField extends StatelessWidget {
  const _PhoneField({required this.dial, required this.onDial, required this.controller});

  final String dial;
  final ValueChanged<String> onDial;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    // Left to right, as the website lays the number out: a number reads the
    // same way in Arabic and English, and the code belongs before it.
    return Directionality(
      textDirection: TextDirection.ltr,
      child: Row(
        children: [
          SizedBox(
            width: 128,
            child: DropdownButtonFormField<String>(
              initialValue: dial,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'المفتاح'),
              // The open list names the country; the closed field has room
              // for the code alone, and a name cut to «ال…» says nothing.
              selectedItemBuilder: (context) => [
                for (final (code, _) in dialCodes) Text('+$code'),
              ],
              items: [
                for (final (code, name) in dialCodes)
                  DropdownMenuItem(value: code, child: Text('+$code $name', overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => onDial(v ?? '249'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumberNational],
              decoration: const InputDecoration(labelText: 'رقم الجوال', hintText: '0912345678'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error(this.message);
  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text(message!,
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.error, height: 1.6)),
    );
  }
}

/// «أظهر كلمة المرور» (البند ١٤٢): the owner asked for it on the site and in
/// the app — a password typed blind on a phone keyboard is the commonest way
/// to lock yourself out.
class _PasswordField extends StatefulWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    required this.hints,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final List<String> hints;
  final ValueChanged<String>? onSubmitted;

  @override
  State<_PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<_PasswordField> {
  bool _shown = false;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: widget.controller,
      obscureText: !_shown,
      autofillHints: widget.hints,
      onSubmitted: widget.onSubmitted,
      decoration: InputDecoration(
        labelText: widget.label,
        suffixIcon: IconButton(
          tooltip: _shown ? 'أخفِ كلمة المرور' : 'أظهر كلمة المرور',
          icon: Icon(_shown ? Icons.visibility_off : Icons.visibility),
          onPressed: () => setState(() => _shown = !_shown),
        ),
      ),
    );
  }
}

class _SignInForm extends StatefulWidget {
  const _SignInForm();

  @override
  State<_SignInForm> createState() => _SignInFormState();
}

class _SignInFormState extends State<_SignInForm> {
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String _dial = '249';
  bool _byEmail = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await accountController.signIn(
        method: _byEmail ? 'email' : 'phone',
        dialCode: _dial,
        phone: _phone.text,
        email: _email.text.trim(),
        password: _password.text,
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_byEmail)
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'البريد الإلكتروني'),
            )
          else
            _PhoneField(dial: _dial, onDial: (v) => setState(() => _dial = v), controller: _phone),
          const SizedBox(height: 12),
          _PasswordField(
            controller: _password,
            label: 'كلمة المرور',
            hints: const [AutofillHints.password],
            onSubmitted: (_) => _busy ? null : _submit(),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('دخول'),
          ),
          _Error(_error),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => setState(() {
              _byEmail = !_byEmail;
              _error = null;
            }),
            child: Text(_byEmail ? 'الدخول برقم الجوال' : 'الدخول بالبريد الإلكتروني'),
          ),
          TextButton(
            onPressed: () => openOnSite(context, '/reset'),
            child: const Text('نسيت كلمة المرور؟'),
          ),
        ],
      ),
    );
  }
}

class _SignUpForm extends StatefulWidget {
  const _SignUpForm({required this.onCreatedElsewhere});

  /// The account was made but the sign-in after it was not: back to «ادخل».
  final VoidCallback onCreatedElsewhere;

  @override
  State<_SignUpForm> createState() => _SignUpFormState();
}

class _SignUpFormState extends State<_SignUpForm> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  String _dial = '249';
  String _role = 'farmer';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await accountController.signUp(
        fullName: _name.text.trim(),
        role: _role,
        dialCode: _dial,
        phone: _phone.text,
        password: _password.text,
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          autofillHints: const [AutofillHints.name],
          decoration: const InputDecoration(labelText: 'اسمك الكامل'),
        ),
        const SizedBox(height: 12),
        Text('أنت هنا', style: TextStyle(color: mutedOn(context), fontSize: 13)),
        const SizedBox(height: 6),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'farmer', label: Text('مزارع وصاحب أرض')),
            ButtonSegment(value: 'investor', label: Text('مستثمر')),
          ],
          selected: {_role},
          onSelectionChanged: (s) => setState(() => _role = s.first),
        ),
        const SizedBox(height: 12),
        _PhoneField(dial: _dial, onDial: (v) => setState(() => _dial = v), controller: _phone),
        const SizedBox(height: 12),
        _PasswordField(
          controller: _password,
          label: 'كلمة المرور (ثمانية أحرف على الأقل)',
          hints: const [AutofillHints.newPassword],
        ),
        const SizedBox(height: 8),
        Text(
          'رقمك هو اسم دخولك، ولا تصله رسالة. احفظ كلمة المرور: بها تدخل من الموقع والتطبيق.',
          style: TextStyle(fontSize: 12, color: mutedOn(context), height: 1.7),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('أنشئ حسابي'),
        ),
        _Error(_error),
        if (_error != null && _error!.startsWith('أُنشئ حسابك'))
          TextButton(onPressed: widget.onCreatedElsewhere, child: const Text('ادخل الآن')),
      ],
    );
  }
}

/* ------------------------------------------------------------------ *
 * Signed in
 * ------------------------------------------------------------------ */

class _SignedIn extends StatefulWidget {
  const _SignedIn();

  @override
  State<_SignedIn> createState() => _SignedInState();
}

class _SignedInState extends State<_SignedIn> {
  late Future<Account> _future = accountController.me();

  void _reload() => setState(() => _future = accountController.me());

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: FutureBuilder<Account>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Icon(Icons.cloud_off, size: 36, color: mutedOn(context)),
                const SizedBox(height: 10),
                Text('${snap.error}', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                FilledButton(onPressed: _reload, child: const Text('إعادة المحاولة')),
              ],
            );
          }
          final a = snap.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
            children: [
              _WhoCard(account: a),
              if (a.isAdmin) ...[
                const SizedBox(height: 16),
                _ReviewCard(account: a),
              ],
              const SizedBox(height: 16),
              const _MessagesCard(),
              const SizedBox(height: 16),
              _NoticesCard(account: a, onChanged: _reload),
              const SizedBox(height: 16),
              _LandsCard(account: a),
            ],
          );
        },
      ),
    );
  }
}

class _WhoCard extends StatelessWidget {
  const _WhoCard({required this.account});
  final Account account;

  @override
  Widget build(BuildContext context) {
    final label = roleLabel(account.role);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
              child: Icon(account.isAdmin ? Icons.shield : Icons.person,
                  color: Theme.of(context).colorScheme.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('أنت داخل بحساب', style: TextStyle(fontSize: 12, color: mutedOn(context))),
                  Text(account.name.isEmpty ? 'بلا اسم' : account.name,
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                  if (label.isNotEmpty)
                    Text(label, style: TextStyle(color: Theme.of(context).colorScheme.primary)),
                ],
              ),
            ),
            TextButton.icon(
              onPressed: () => accountSignOut(context),
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('خروج'),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> accountSignOut(BuildContext context) async {
  final yes = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: const Text('الخروج من حسابك؟'),
      content: const Text('تدخل بعدها برقمك أو بريدك وكلمة المرور.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('إلغاء')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('خروج')),
      ],
    ),
  );
  if (yes == true) await accountController.signOut();
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.trailing});
  final String title;
  final Widget? trailing;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                ),
                ?trailing,
              ],
            ),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// The administrator's review list — the queues of /admin/inbox with
/// something waiting. Each decision is still taken on the website's page.
class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.account});
  final Account account;

  @override
  Widget build(BuildContext context) {
    final total = account.reviewTotal ?? 0;
    return _Section(
      title: total > 0 ? 'قائمة المراجعة ($total)' : 'قائمة المراجعة',
      trailing: TextButton(
        onPressed: () => openOnSite(context, '/admin/inbox'),
        child: const Text('في الموقع'),
      ),
      children: [
        if (account.review.isEmpty)
          Text('لا شيء ينتظر قرارك الآن.', style: TextStyle(color: mutedOn(context))),
        for (final s in account.review)
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: Text('${s.title} (${s.count})', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(s.info ? 'للاطّلاع — ${s.what}' : s.what,
                style: TextStyle(fontSize: 12, color: mutedOn(context))),
            children: [
              for (final i in s.items)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(i.title),
                  subtitle: i.meta == null ? null : Text(i.meta!),
                ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () => openOnSite(context, s.href),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: const Text('قرّر في الموقع'),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

class _NoticesCard extends StatelessWidget {
  const _NoticesCard({required this.account, required this.onChanged});
  final Account account;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final a = account;
    return _Section(
      title: a.unread > 0 ? 'الإشعارات (${a.unread} جديد)' : 'الإشعارات',
      trailing: a.unread > 0
          ? TextButton(
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                try {
                  await accountController.markAllRead();
                  onChanged();
                } on ApiException catch (e) {
                  messenger.showSnackBar(SnackBar(content: Text(e.message)));
                }
              },
              child: const Text('علّم الكلّ مقروءاً'),
            )
          : null,
      children: [
        if (a.notifications.isEmpty)
          Text('لا إشعارات بعد.', style: TextStyle(color: mutedOn(context))),
        for (final n in a.notifications.take(15))
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(n.read ? Icons.notifications_none : Icons.notifications_active,
                color: n.read ? mutedOn(context) : Theme.of(context).colorScheme.primary),
            title: Text(n.title,
                style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w800)),
            subtitle: n.body.isEmpty ? null : Text(n.body, maxLines: 3, overflow: TextOverflow.ellipsis),
            onTap: n.link == null
                ? null
                : () => n.link!.startsWith('/messages/')
                    ? Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => ThreadScreen(id: n.link!.substring('/messages/'.length))))
                    : openOnSite(context, n.link!),
          ),
      ],
    );
  }
}

/// صندوق الرسائل (البند ١٤٤): the way in from «حسابي».
class _MessagesCard extends StatelessWidget {
  const _MessagesCard();

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'الرسائل',
      children: [
        Text('محادثات طلبات الشراكة وعقودها، و«راسل سوداقري».',
            style: TextStyle(color: mutedOn(context), height: 1.6)),
        const SizedBox(height: 8),
        FilledButton.icon(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const MessagesScreen())),
          icon: const Icon(Icons.chat_bubble_outline),
          label: const Text('افتح الرسائل'),
        ),
      ],
    );
  }
}

class _LandsCard extends StatelessWidget {
  const _LandsCard({required this.account});
  final Account account;

  @override
  Widget build(BuildContext context) {
    final a = account;
    return _Section(
      title: 'أراضيّ',
      children: [
        if (a.lands.isEmpty)
          Text('لم تسجّل أرضاً بعد.', style: TextStyle(color: mutedOn(context))),
        for (final l in a.lands)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(l.verification == 'verified' ? Icons.verified : Icons.landscape,
                color: l.verification == 'verified'
                    ? Theme.of(context).colorScheme.primary
                    : mutedOn(context)),
            title: Text(l.name, style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text([
              [l.state, if (l.locality != null && l.locality!.isNotEmpty) l.locality].join(' · '),
              if (l.feddans != null) '${l.feddans} فدان',
              l.statusLabel,
              if (l.openToInvestors) 'مفتوحة للمستثمرين',
            ].join(' — ')),
            onTap: () => openOnSite(context, '/lands'),
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () => openOnSite(context, '/lands'),
              icon: const Icon(Icons.add_location_alt, size: 18),
              label: const Text('سجّل أرضاً'),
            ),
            OutlinedButton.icon(
              onPressed: () => openOnSite(context, '/invest'),
              icon: const Icon(Icons.handshake, size: 18),
              label: const Text('فرص الاستثمار'),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'تسجيل الأرض وطلب الشراكة يفتحان في الموقع الآن، ويأتيان إلى التطبيق مع «حدّد أرضك من الخريطة».',
          style: TextStyle(fontSize: 12, color: mutedOn(context), height: 1.7),
        ),
      ],
    );
  }
}
